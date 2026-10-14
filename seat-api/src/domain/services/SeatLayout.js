import { ValidationError } from '../errors/DomainError.js';

/**
 * Distribución física del bus: cuántos asientos tiene y cómo se agrupan en
 * filas de 2 + pasillo + 2.
 *
 * Vive en el dominio porque "el asiento 41 no existe" es una regla del negocio,
 * no una validación de formulario.
 */
export class SeatLayout {
  constructor({ totalSeats = 40, seatsPerRow = 4 } = {}) {
    this.totalSeats = totalSeats;
    this.seatsPerRow = seatsPerRow;
  }

  get rows() {
    return Math.ceil(this.totalSeats / this.seatsPerRow);
  }

  isValidSeat(numero) {
    return Number.isInteger(numero) && numero >= 1 && numero <= this.totalSeats;
  }

  assertValidSeat(numero) {
    if (!this.isValidSeat(numero)) {
      throw new ValidationError(
        `El asiento debe ser un número entre 1 y ${this.totalSeats}`,
        { asiento: numero, totalSeats: this.totalSeats }
      );
    }
  }

  seatNumbers() {
    return Array.from({ length: this.totalSeats }, (_, i) => i + 1);
  }

  /** "Ventana" o "Pasillo" según la posición dentro de la fila. */
  positionLabel(numero) {
    const offset = (numero - 1) % this.seatsPerRow;
    return offset === 0 || offset === this.seatsPerRow - 1 ? 'Ventana' : 'Pasillo';
  }

  /** Agrupa los asientos en filas con lado izquierdo y derecho, para la vista. */
  toRows(seats) {
    const byNumber = new Map(seats.map((s) => [s.numero, s]));
    const rows = [];

    for (let row = 1; row <= this.rows; row++) {
      const left = [];
      const right = [];
      for (let col = 0; col < this.seatsPerRow; col++) {
        const numero = (row - 1) * this.seatsPerRow + col + 1;
        const seat = byNumber.get(numero);
        if (!seat) continue;
        if (col < this.seatsPerRow / 2) left.push(seat);
        else right.push(seat);
      }
      rows.push({ row, left, right });
    }

    return rows;
  }
}
