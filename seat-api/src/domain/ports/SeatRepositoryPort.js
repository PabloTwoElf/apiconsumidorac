/**
 * Puerto de salida: persistencia de asientos, holds y reservas.
 *
 * El dominio y los casos de uso solo conocen esta interfaz. Hoy la implementa
 * InMemorySeatRepository; cambiar a Postgres o Redis significa escribir otro
 * adaptador que cumpla estos métodos, sin tocar una línea de lógica de negocio.
 */
export class SeatRepositoryPort {
  /** @returns {import('../model/Hold.js').Hold | null} */
  findHold(rutaId, fecha, asiento) {
    throw new Error('No implementado');
  }

  /** @returns {import('../model/Hold.js').Hold | null} */
  findHoldById(holdId) {
    throw new Error('No implementado');
  }

  /** @returns {import('../model/Hold.js').Hold[]} */
  listActiveHolds() {
    throw new Error('No implementado');
  }

  /** @returns {import('../model/Hold.js').Hold[]} */
  listHoldsForTrip(rutaId, fecha) {
    throw new Error('No implementado');
  }

  saveHold(hold) {
    throw new Error('No implementado');
  }

  deleteHold(rutaId, fecha, asiento) {
    throw new Error('No implementado');
  }

  /** @returns {import('../model/Reservation.js').Reservation | null} */
  findReservation(rutaId, fecha, asiento) {
    throw new Error('No implementado');
  }

  saveReservation(reservation) {
    throw new Error('No implementado');
  }

  /** @returns {number} Cantidad de holds expirados eliminados. */
  purgeExpiredHolds(now) {
    throw new Error('No implementado');
  }

  stats() {
    throw new Error('No implementado');
  }
}
