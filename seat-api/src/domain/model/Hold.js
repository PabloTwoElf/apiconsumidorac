/**
 * Bloqueo temporal de un asiento.
 *
 * Un hold reserva el asiento mientras el usuario completa el pago. Expira solo:
 * si el comprador abandona el checkout, el asiento vuelve al inventario sin que
 * nadie tenga que intervenir.
 */
export class Hold {
  constructor({ holdId, rutaId, fecha, asiento, userId, companyName = null, createdAt, expiresAt }) {
    this.holdId = holdId;
    this.rutaId = rutaId;
    this.fecha = fecha;
    this.asiento = asiento;
    this.userId = userId;
    this.companyName = companyName;
    this.createdAt = createdAt;
    this.expiresAt = expiresAt;
  }

  isExpiredAt(now) {
    return now > this.expiresAt;
  }

  remainingMsAt(now) {
    return Math.max(0, this.expiresAt - now);
  }

  belongsTo(userId) {
    return Boolean(userId) && this.userId === userId;
  }

  toJSON() {
    return {
      holdId: this.holdId,
      rutaId: this.rutaId,
      fecha: this.fecha,
      asiento: this.asiento,
      userId: this.userId,
      companyName: this.companyName,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
    };
  }
}
