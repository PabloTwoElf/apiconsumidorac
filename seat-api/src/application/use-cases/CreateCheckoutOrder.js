import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/DomainError.js';
import { PaymentOrder } from '../../domain/model/PaymentOrder.js';

/**
 * Caso de uso: crear la orden de pago para unos asientos ya bloqueados.
 *
 * Es el primer paso de la orquestación. El punto importante es que el importe
 * NO viene del cliente: se recalcula aquí con PricingPolicy a partir de los
 * holds verificados. Si el navegador enviara el total, cualquiera podría pagar
 * un peso por cinco asientos.
 *
 * Secuencia:
 *   1. Verificar que cada hold existe, está vigente y pertenece al usuario.
 *   2. Cotizar el precio en moneda local y convertirlo a la moneda de cobro.
 *   3. Pedir la orden a la pasarela (puerto PaymentGatewayPort).
 *   4. Guardar el vínculo orden ↔ holds, que es lo que permitirá confirmar las
 *      reservas cuando el pago se capture.
 */
export class CreateCheckoutOrder {
  constructor({
    seatRepository,
    orderRepository,
    paymentGateway,
    pricingPolicy,
    clock,
    paymentCurrency,
    fxRate,
    publicBaseUrl,
    appReturnBaseUrl = '',
    appReturnPath = '/',
  }) {
    this.seatRepository = seatRepository;
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
    this.pricingPolicy = pricingPolicy;
    this.clock = clock;
    this.paymentCurrency = paymentCurrency;
    this.fxRate = fxRate;
    this.publicBaseUrl = publicBaseUrl;
    this.appReturnBaseUrl = appReturnBaseUrl;
    this.appReturnPath = appReturnPath;
  }

  async execute({
    holdIds,
    userId,
    returnUrl = null,
    cancelUrl = null,
    descripcion = null,
    // Origen de la petición (cabecera Origin). Permite deducir a dónde volver
    // cuando el consumidor no lo indica, sin depender de un puerto fijo.
    origin = null,
  }) {
    if (!Array.isArray(holdIds) || holdIds.length === 0) {
      throw new ValidationError('holdIds debe ser un arreglo con al menos un bloqueo');
    }
    if (!userId) {
      throw new ValidationError('userId es obligatorio para crear una orden de pago');
    }

    const now = this.clock.now();
    this.seatRepository.purgeExpiredHolds(now);

    const holds = this.#resolveHolds({ holdIds, userId, now });
    const { rutaId, fecha } = holds[0];

    // Todos los asientos deben pertenecer al mismo viaje: una orden paga un viaje.
    if (holds.some((hold) => hold.rutaId !== rutaId || hold.fecha !== fecha)) {
      throw new ValidationError('Todos los bloqueos de una orden deben ser del mismo viaje (rutaId y fecha)');
    }

    const companyName = holds.find((hold) => hold.companyName)?.companyName ?? null;
    const quote = this.pricingPolicy.quote(holds.length);

    if (this.pricingPolicy.requiresCompanyName(holds.length) && !companyName) {
      throw new ValidationError(
        `Para ${this.pricingPolicy.corporateFrom} asientos o más se requiere el nombre de la compañía`
      );
    }

    const amount = quote.money.convertTo(this.paymentCurrency, this.fxRate);
    const asientos = holds.map((hold) => hold.asiento);
    const referenceId = `RUTA-${rutaId}-${fecha}-${now}`;

    // Un único ítem con el total ya descontado: PayPal exige que la suma de los
    // ítems coincida con el importe, y repartir el descuento asiento por asiento
    // produce descuadres de centavos.
    const items = [
      {
        name: `Asientos ${asientos.join(', ')}`.slice(0, 127),
        quantity: '1',
        unit_amount: { currency_code: amount.moneda, value: amount.valor },
        description: `Ruta ${rutaId} · ${fecha} · ${holds.length} asiento(s)`.slice(0, 127),
        category: 'DIGITAL_GOODS',
      },
    ];

    // A dónde volverá el comprador, por orden de preferencia: lo que indique el
    // consumidor, la configuración explícita, o el origen de esta petición.
    // Lo último es lo que evita tener que fijar un puerto en ningún sitio.
    const appBase = this.appReturnBaseUrl || origin || '';
    const returnTo = returnUrl || (appBase ? `${appBase}${this.appReturnPath}` : null);
    const cancelTo = cancelUrl || returnTo;

    const gatewayOrder = await this.paymentGateway.createOrder({
      amount,
      referenceId,
      customId: userId.slice(0, 127),
      description: (descripcion || `CulturalTrip · Ruta ${rutaId} · ${fecha}`).slice(0, 127),
      items,
      // PayPal recibe siempre la URL del propio API, que es estable. El API
      // reenvía después a `returnTo`, que viaja guardado en la orden: así el
      // destino puede cambiar de puerto o de dominio sin invalidar órdenes ya
      // creadas, y no hace falta configurar nada.
      returnUrl: `${this.publicBaseUrl}/checkout/retorno`,
      cancelUrl: `${this.publicBaseUrl}/checkout/cancelado`,
    });

    const order = new PaymentOrder({
      orderId: gatewayOrder.orderId,
      rutaId,
      fecha,
      userId,
      holdIds: holds.map((hold) => hold.holdId),
      asientos,
      companyName,
      pricing: {
        cantidad: quote.quantity,
        moneda: quote.currency,
        precioUnitario: quote.basePrice,
        subtotal: quote.baseTotal,
        porcentajeDescuento: quote.discountPercent,
        montoDescuento: quote.discountAmount,
        total: quote.total,
        ahorros: quote.savings,
      },
      paypalAmount: { ...amount, tasaConversion: this.fxRate },
      approvalUrl: gatewayOrder.approvalUrl,
      returnTo,
      cancelTo,
      createdAt: now,
      events: [{ type: 'CREATED', at: now, referenceId }],
    });

    this.orderRepository.save(order);

    return {
      orderId: order.orderId,
      status: gatewayOrder.status,
      approvalUrl: order.approvalUrl,
      rutaId,
      fecha,
      asientos,
      holdIds: order.holdIds,
      // El hold más próximo a vencer marca el tiempo real que queda para pagar.
      expiraEn: Math.min(...holds.map((hold) => hold.remainingMsAt(now))),
      pricing: order.pricing,
      cobro: order.paypalAmount,
    };
  }

  /** Valida cada hold y devuelve las entidades, o explica exactamente qué falló. */
  #resolveHolds({ holdIds, userId, now }) {
    const unique = [...new Set(holdIds)];

    return unique.map((holdId) => {
      const hold = this.seatRepository.findHoldById(holdId);

      if (!hold) {
        throw new NotFoundError(
          'Uno de los bloqueos no existe o ya expiró; vuelve a seleccionar los asientos',
          { holdId }
        );
      }
      if (hold.isExpiredAt(now)) {
        throw new ConflictError('Uno de los bloqueos expiró; vuelve a seleccionar los asientos', {
          holdId,
        });
      }
      if (hold.userId !== userId) {
        throw new ValidationError('Uno de los bloqueos pertenece a otro usuario', { holdId });
      }

      return hold;
    });
  }
}
