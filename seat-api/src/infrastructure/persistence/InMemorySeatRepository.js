import { SeatRepositoryPort } from '../../domain/ports/SeatRepositoryPort.js';
import { Hold } from '../../domain/model/Hold.js';

/**
 * Adaptador de persistencia en memoria.
 *
 * Limitación conocida y deliberada: el estado vive en el proceso. En local
 * desaparece al reiniciar, y en Vercel cada instancia de la función tiene su
 * propia copia, así que un hold creado en una instancia puede no verse en otra.
 * Para la demostración de la tesis es suficiente; sustituir esto por Redis o
 * Postgres significa escribir otra clase que extienda SeatRepositoryPort y
 * cambiar una línea en el contenedor de dependencias — ninguna regla de
 * negocio se entera. Eso es precisamente lo que compra la arquitectura
 * hexagonal.
 */
export class InMemorySeatRepository extends SeatRepositoryPort {
  constructor() {
    super();
    /** @type {Map<string, Hold>} */
    this.holds = new Map();
    /** @type {Map<string, import('../../domain/model/Reservation.js').Reservation>} */
    this.reservations = new Map();
    /** Índice holdId → clave, para no recorrer todo el mapa en cada búsqueda. */
    this.holdIndex = new Map();
  }

  static key(rutaId, fecha, asiento) {
    return `${rutaId}|${fecha}|${asiento}`;
  }

  findHold(rutaId, fecha, asiento) {
    return this.holds.get(InMemorySeatRepository.key(rutaId, fecha, asiento)) ?? null;
  }

  findHoldById(holdId) {
    const key = this.holdIndex.get(holdId);
    if (!key) return null;
    return this.holds.get(key) ?? null;
  }

  listActiveHolds() {
    return [...this.holds.values()];
  }

  listHoldsForTrip(rutaId, fecha) {
    return [...this.holds.values()].filter((hold) => hold.rutaId === rutaId && hold.fecha === fecha);
  }

  saveHold(hold) {
    const key = InMemorySeatRepository.key(hold.rutaId, hold.fecha, hold.asiento);
    this.holds.set(key, hold);
    this.holdIndex.set(hold.holdId, key);
    return hold;
  }

  deleteHold(rutaId, fecha, asiento) {
    const key = InMemorySeatRepository.key(rutaId, fecha, asiento);
    const hold = this.holds.get(key);
    if (hold) this.holdIndex.delete(hold.holdId);
    return this.holds.delete(key);
  }

  findReservation(rutaId, fecha, asiento) {
    return this.reservations.get(InMemorySeatRepository.key(rutaId, fecha, asiento)) ?? null;
  }

  saveReservation(reservation) {
    const key = InMemorySeatRepository.key(reservation.rutaId, reservation.fecha, reservation.asiento);
    this.reservations.set(key, reservation);
    return reservation;
  }

  purgeExpiredHolds(now) {
    let purged = 0;
    for (const [key, hold] of this.holds.entries()) {
      if (hold.isExpiredAt(now)) {
        this.holds.delete(key);
        this.holdIndex.delete(hold.holdId);
        purged++;
      }
    }
    return purged;
  }

  stats() {
    return {
      holdsActivos: this.holds.size,
      reservasConfirmadas: this.reservations.size,
      asientosOcupados: this.holds.size + this.reservations.size,
    };
  }

  /** Usado por el panel para poder demostrar el flujo desde cero. */
  reset() {
    this.holds.clear();
    this.reservations.clear();
    this.holdIndex.clear();
  }
}
