import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/DomainError.js';
import { Reservation } from '../../domain/model/Reservation.js';

/**
 * Caso de uso: capturar el pago y confirmar los asientos.
 *
 * Segundo paso de la orquestación, y el único punto del sistema donde un
 * asiento pasa a estar vendido.
 *
 * El orden importa: primero se cobra, después se reserva. Al revés podríamos
 * dejar asientos vendidos sin cobro si PayPal rechaza la captura.
 *
 * Eso abre el caso incómodo de "cobrado pero el hold expiró mientras el
 * comprador estaba en PayPal". Perder el asiento silenciosamente sería lo peor
 * posible, así que una vez capturado el dinero se honra el asiento igual si
 * sigue libre, y si otro comprador lo tomó se marca la orden como
 * `requiereAtencion` con el captureId a la vista para gestionar la devolución.
 */
export class CaptureCheckoutOrder {
  constructor({ seatRepository, orderRepository, paymentGateway, confirmReservation, clock }) {
    this.seatRepository = seatRepository;
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
    this.confirmReservation = confirmReservation;
    this.clock = clock;
  }

  async execute({ orderId, userId = null }) {
    if (!orderId) {
      throw new ValidationError('orderId es obligatorio');
    }

    const order = this.orderRepository.findById(orderId);

    if (!order) {
      throw new NotFoundError('La orden no existe en este sistema', { orderId });
    }
    if (userId && order.userId !== userId) {
      throw new ValidationError('La orden pertenece a otro usuario', { orderId });
    }

    // Idempotencia: PayPal y el navegador pueden reintentar la captura. Volver a
    // llamar no debe cobrar dos veces ni duplicar reservas.
    if (order.isPaid) {
      return {
        orderId,
        status: order.status,
        captureId: order.captureId,
        yaProcesada: true,
        asientos: order.asientos,
        reservas: order.asientos.map((asiento) => ({ asiento, estado: 'reservado' })),
        pricing: order.pricing,
        payer: order.payer,
      };
    }

    if (!order.isPending) {
      throw new ConflictError(`La orden está en estado "${order.status}" y no se puede capturar`, {
        orderId,
        status: order.status,
      });
    }

    const now = this.clock.now();

    let capture;
    try {
      capture = await this.paymentGateway.captureOrder(orderId);
    } catch (error) {
      order.markFailed({ reason: error.message, at: now });
      this.orderRepository.save(order);
      throw error;
    }

    if (capture.status && !['COMPLETED', 'APPROVED'].includes(capture.status)) {
      order.markFailed({ reason: `PayPal devolvió estado ${capture.status}`, at: now });
      this.orderRepository.save(order);
      throw new ConflictError(`El pago no se completó (estado ${capture.status})`, {
        orderId,
        status: capture.status,
      });
    }

    // Dinero cobrado. A partir de aquí hay que entregar los asientos.
    const reservas = [];
    const conflictos = [];

    for (const holdId of order.holdIds) {
      const hold = this.seatRepository.findHoldById(holdId);

      if (hold && !hold.isExpiredAt(now)) {
        const result = this.confirmReservation.execute({
          rutaId: hold.rutaId,
          fecha: hold.fecha,
          asiento: hold.asiento,
          holdId,
          orderId,
          captureId: capture.captureId,
        });
        reservas.push({ asiento: result.asiento, estado: 'reservado', reservedAt: result.reservedAt });
        continue;
      }

      // El hold ya no vale. Buscamos el asiento por la orden, que sí lo recuerda.
      const indice = order.holdIds.indexOf(holdId);
      const asiento = order.asientos[indice];

      const ocupado = this.seatRepository.findReservation(order.rutaId, order.fecha, asiento);
      if (ocupado) {
        conflictos.push({
          asiento,
          estado: 'no_disponible',
          motivo: 'El bloqueo expiró y otro comprador reservó el asiento',
        });
        continue;
      }

      // Pago válido y asiento libre: se honra aunque el temporizador venciera.
      this.seatRepository.saveReservation(
        new Reservation({
          rutaId: order.rutaId,
          fecha: order.fecha,
          asiento,
          userId: order.userId,
          holdId,
          orderId,
          captureId: capture.captureId,
          reservedAt: now,
        })
      );
      this.seatRepository.deleteHold(order.rutaId, order.fecha, asiento);
      reservas.push({
        asiento,
        estado: 'reservado',
        reservedAt: now,
        nota: 'El bloqueo había expirado, pero el asiento seguía libre y el pago fue válido',
      });
    }

    order.markPaid({ captureId: capture.captureId, payer: capture.payer, at: now });
    if (conflictos.length > 0) {
      order.events.push({ type: 'NEEDS_ATTENTION', at: now, conflictos });
    }
    this.orderRepository.save(order);

    return {
      orderId,
      status: order.status,
      captureId: capture.captureId,
      yaProcesada: false,
      rutaId: order.rutaId,
      fecha: order.fecha,
      asientos: reservas.map((r) => r.asiento),
      reservas,
      conflictos,
      requiereAtencion: conflictos.length > 0,
      pricing: order.pricing,
      cobro: order.paypalAmount,
      payer: capture.payer,
    };
  }
}
