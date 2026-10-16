import { ValidationError } from '../errors/DomainError.js';

/**
 * Ciclo de vida de una orden de pago dentro de nuestro sistema.
 *
 * No replica los estados de PayPal: describe qué puede hacer la aplicación.
 * PENDING  → orden creada, esperando que el comprador apruebe en PayPal
 * REVIEW   → PayPal dejó la captura en PENDING; un administrador decide
 * PAID     → fondos capturados y asientos convertidos en reservas
 * FAILED   → la captura fue rechazada
 * CANCELLED→ el comprador abandonó o los holds expiraron
 */
export const OrderStatus = Object.freeze({
  PENDING: 'pending',
  REVIEW: 'en_revision',
  PAID: 'paid',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export class PaymentOrder {
  constructor({
    orderId,
    rutaId,
    fecha,
    userId,
    holdIds,
    asientos,
    pricing,
    paypalAmount,
    status = OrderStatus.PENDING,
    approvalUrl = null,
    captureId = null,
    payer = null,
    companyName = null,
    // A dónde devolver al comprador cuando vuelva de PayPal. Se guarda por
    // orden, y no en configuración, para que el puerto o el dominio de la
    // aplicación que inició la compra puedan cambiar sin romper el retorno.
    returnTo = null,
    cancelTo = null,
    createdAt,
    updatedAt = null,
    events = [],
  }) {
    if (!Array.isArray(holdIds) || holdIds.length === 0) {
      throw new ValidationError('Una orden de pago requiere al menos un hold asociado');
    }

    this.orderId = orderId;
    this.rutaId = rutaId;
    this.fecha = fecha;
    this.userId = userId;
    this.holdIds = holdIds;
    this.asientos = asientos;
    this.pricing = pricing;
    this.paypalAmount = paypalAmount;
    this.status = status;
    this.approvalUrl = approvalUrl;
    this.captureId = captureId;
    this.payer = payer;
    this.companyName = companyName;
    this.returnTo = returnTo;
    this.cancelTo = cancelTo;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt ?? createdAt;
    this.events = events;
  }

  get isPending() {
    return this.status === OrderStatus.PENDING;
  }

  get isInReview() {
    return this.status === OrderStatus.REVIEW;
  }

  get isPaid() {
    return this.status === OrderStatus.PAID;
  }

  markPaid({ captureId, payer, at }) {
    this.status = OrderStatus.PAID;
    this.captureId = captureId;
    this.payer = payer;
    this.updatedAt = at;
    this.events.push({ type: 'PAID', at, captureId });
    return this;
  }

  /** La captura quedó PENDING en PayPal: los asientos esperan la decisión del admin. */
  markInReview({ captureId, payer, captureStatus, at }) {
    this.status = OrderStatus.REVIEW;
    this.captureId = captureId;
    this.payer = payer;
    this.updatedAt = at;
    this.events.push({ type: 'IN_REVIEW', at, captureId, captureStatus });
    return this;
  }

  markFailed({ reason, at }) {
    this.status = OrderStatus.FAILED;
    this.updatedAt = at;
    this.events.push({ type: 'FAILED', at, reason });
    return this;
  }

  markCancelled({ reason, at }) {
    this.status = OrderStatus.CANCELLED;
    this.updatedAt = at;
    this.events.push({ type: 'CANCELLED', at, reason });
    return this;
  }

  recordWebhook({ eventType, at }) {
    this.events.push({ type: 'WEBHOOK', eventType, at });
    return this;
  }

  toJSON() {
    return {
      orderId: this.orderId,
      rutaId: this.rutaId,
      fecha: this.fecha,
      userId: this.userId,
      holdIds: this.holdIds,
      asientos: this.asientos,
      pricing: this.pricing,
      paypalAmount: this.paypalAmount,
      status: this.status,
      approvalUrl: this.approvalUrl,
      captureId: this.captureId,
      payer: this.payer,
      companyName: this.companyName,
      returnTo: this.returnTo,
      cancelTo: this.cancelTo,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      events: this.events,
    };
  }
}
