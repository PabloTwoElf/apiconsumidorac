import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/DomainError.js';

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
 *
 * Si PayPal deja la captura en PENDING (revisión, multidivisa, sandbox) no se
 * entregan asientos: la orden pasa a `en_revision`, los bloqueos se alargan y
 * un administrador la aprueba o rechaza desde el panel (ReviewPendingPayment).
 * Volver a llamar a la captura es seguro y sirve al cliente para saber cuándo
 * se decidió.
 */
export class CaptureCheckoutOrder {
  constructor({ seatRepository, orderRepository, paymentGateway, deliverOrderSeats, clock, reviewHoldMs = 60 * 60_000 }) {
    this.seatRepository = seatRepository;
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
    this.deliverOrderSeats = deliverOrderSeats;
    this.clock = clock;
    this.reviewHoldMs = reviewHoldMs;
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
        enRevision: false,
        rutaId: order.rutaId,
        fecha: order.fecha,
        asientos: order.asientos,
        reservas: order.asientos.map((asiento) => ({ asiento, estado: 'reservado' })),
        conflictos: [],
        requiereAtencion: false,
        pricing: order.pricing,
        cobro: order.paypalAmount,
        payer: order.payer,
      };
    }

    if (order.isInReview) {
      return this.#reviewResponse(order);
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

    // PENDING: PayPal aceptó el pago pero lo retiene. Un administrador decide.
    if (capture.status === 'PENDING') {
      this.#extendHolds(order, now + this.reviewHoldMs);
      order.markInReview({
        captureId: capture.captureId,
        payer: capture.payer,
        captureStatus: capture.status,
        at: now,
      });
      this.orderRepository.save(order);
      return this.#reviewResponse(order);
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
    const { reservas, conflictos } = this.deliverOrderSeats.execute({
      order,
      captureId: capture.captureId,
      now,
    });

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
      enRevision: false,
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

  /** Mantiene los asientos apartados mientras el pago está en revisión. */
  #extendHolds(order, until) {
    for (const holdId of order.holdIds) {
      const hold = this.seatRepository.findHoldById(holdId);
      if (hold) {
        hold.extendUntil(until);
        this.seatRepository.saveHold(hold);
      }
    }
  }

  #reviewResponse(order) {
    return {
      orderId: order.orderId,
      status: order.status,
      captureId: order.captureId,
      yaProcesada: false,
      enRevision: true,
      mensaje: 'PayPal dejó el pago pendiente. Un administrador lo está revisando; los asientos siguen apartados.',
      rutaId: order.rutaId,
      fecha: order.fecha,
      asientos: order.asientos,
      reservas: [],
      conflictos: [],
      requiereAtencion: false,
      pricing: order.pricing,
      cobro: order.paypalAmount,
      payer: order.payer,
    };
  }
}
