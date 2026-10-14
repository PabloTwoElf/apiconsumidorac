/**
 * Reserva confirmada: el asiento salió del inventario de forma definitiva.
 * Se crea únicamente cuando un pago queda capturado.
 */
export class Reservation {
  constructor({ rutaId, fecha, asiento, userId, holdId, orderId = null, captureId = null, reservedAt }) {
    this.rutaId = rutaId;
    this.fecha = fecha;
    this.asiento = asiento;
    this.userId = userId;
    this.holdId = holdId;
    this.orderId = orderId;
    this.captureId = captureId;
    this.reservedAt = reservedAt;
  }

  toJSON() {
    return { ...this };
  }
}
