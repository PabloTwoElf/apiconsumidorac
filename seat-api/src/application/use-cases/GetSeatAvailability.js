import { ValidationError } from '../../domain/errors/DomainError.js';
import { Seat, SeatStatus } from '../../domain/model/Seat.js';

/**
 * Caso de uso: mapa de asientos de un viaje con su estado interno.
 *
 * Mantiene el contrato original de /api/asientos/disponibles para no romper a
 * los clientes que ya lo consumen.
 */
export class GetSeatAvailability {
  constructor({ seatRepository, seatLayout, clock, holdTtlMs }) {
    this.seatRepository = seatRepository;
    this.seatLayout = seatLayout;
    this.clock = clock;
    this.holdTtlMs = holdTtlMs;
  }

  execute({ rutaId, fecha }) {
    if (!rutaId || !fecha) {
      throw new ValidationError('rutaId y fecha son parámetros obligatorios');
    }

    const now = this.clock.now();
    this.seatRepository.purgeExpiredHolds(now);

    const holds = new Map(
      this.seatRepository
        .listHoldsForTrip(rutaId, fecha)
        .filter((hold) => !hold.isExpiredAt(now))
        .map((hold) => [hold.asiento, hold])
    );

    const asientos = this.seatLayout.seatNumbers().map((numero) => {
      if (this.seatRepository.findReservation(rutaId, fecha, numero)) {
        return new Seat({ numero, estado: SeatStatus.RESERVED });
      }
      const hold = holds.get(numero);
      if (hold) {
        return new Seat({ numero, estado: SeatStatus.HELD, expiresAt: hold.expiresAt });
      }
      return new Seat({ numero, estado: SeatStatus.AVAILABLE });
    });

    const available = asientos.filter((s) => s.isAvailable).map((s) => s.numero);

    return {
      rutaId,
      fecha,
      ttlMs: this.holdTtlMs,
      asientos: asientos.map((s) => s.toJSON()),
      available,
      total: available.length,
    };
  }
}
