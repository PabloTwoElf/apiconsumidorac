/**
 * Estados internos de un asiento (lenguaje del dominio).
 */
export const SeatStatus = Object.freeze({
  AVAILABLE: 'available',
  HELD: 'held',
  RESERVED: 'reserved',
});

/**
 * Estados que consume la interfaz. Se mantienen separados de SeatStatus a
 * propósito: la UI distingue "mi hold" del hold de otro usuario, distinción que
 * no existe en el dominio porque depende de quién pregunta.
 */
export const SeatViewStatus = Object.freeze({
  AVAILABLE: 'disponible',
  HELD_BY_OTHER: 'en_hold',
  HELD_BY_ME: 'miHold',
  OCCUPIED: 'ocupado',
});

export class Seat {
  constructor({ numero, estado = SeatStatus.AVAILABLE, expiresAt = null }) {
    this.numero = numero;
    this.estado = estado;
    this.expiresAt = expiresAt;
  }

  get isAvailable() {
    return this.estado === SeatStatus.AVAILABLE;
  }

  toJSON() {
    const json = { numero: this.numero, estado: this.estado };
    if (this.expiresAt !== null) json.expiresAt = this.expiresAt;
    return json;
  }
}
