import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/DomainError.js';
import { OrderStatus } from '../../domain/model/PaymentOrder.js';

/**
 * Caso de uso: revisión manual de pagos que PayPal dejó en PENDING.
 *
 * El administrador ve la cola desde el panel y decide:
 *  - aprobar  → se entregan los asientos (DeliverOrderSeats) y la orden queda pagada
 *  - rechazar → la orden falla y los asientos vuelven al inventario
 *
 * El cliente se entera reintentando la captura, que es idempotente y devuelve
 * el estado final en cuanto existe.
 */
export class ReviewPendingPayment {
  constructor({ orderRepository, seatRepository, deliverOrderSeats, clock }) {
    this.orderRepository = orderRepository;
    this.seatRepository = seatRepository;
    this.deliverOrderSeats = deliverOrderSeats;
    this.clock = clock;
  }

  listar() {
    const pagos = this.orderRepository.query({ status: OrderStatus.REVIEW }).map((order) => ({
      orderId: order.orderId,
      captureId: order.captureId,
      userId: order.userId,
      rutaId: order.rutaId,
      fecha: order.fecha,
      asientos: order.asientos,
      total: order.pricing.total,
      moneda: order.pricing.moneda,
      cobro: order.paypalAmount,
      pagador: order.payer?.email_address ?? null,
      creadaEn: order.createdAt,
      enRevisionDesde: order.updatedAt,
    }));
    return { total: pagos.length, pagos };
  }

  aprobar({ orderId }) {
    const order = this.#findInReview(orderId);
    const now = this.clock.now();

    const { reservas, conflictos } = this.deliverOrderSeats.execute({
      order,
      captureId: order.captureId,
      now,
    });

    order.markPaid({ captureId: order.captureId, payer: order.payer, at: now });
    order.events.push({ type: 'APPROVED_BY_ADMIN', at: now });
    if (conflictos.length > 0) {
      order.events.push({ type: 'NEEDS_ATTENTION', at: now, conflictos });
    }
    this.orderRepository.save(order);

    return {
      orderId,
      status: order.status,
      reservas,
      conflictos,
      requiereAtencion: conflictos.length > 0,
    };
  }

  rechazar({ orderId, motivo = 'Rechazado por el administrador' }) {
    const order = this.#findInReview(orderId);
    const now = this.clock.now();

    for (const holdId of order.holdIds) {
      const hold = this.seatRepository.findHoldById(holdId);
      if (hold) this.seatRepository.deleteHold(hold.rutaId, hold.fecha, hold.asiento);
    }

    order.markFailed({ reason: motivo, at: now });
    this.orderRepository.save(order);

    return { orderId, status: order.status, motivo, asientosLiberados: order.asientos };
  }

  #findInReview(orderId) {
    if (!orderId) throw new ValidationError('orderId es obligatorio');

    const order = this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundError('La orden no existe en este sistema', { orderId });
    if (!order.isInReview) {
      throw new ConflictError(`La orden está en estado "${order.status}", no en revisión`, {
        orderId,
        status: order.status,
      });
    }
    return order;
  }
}
