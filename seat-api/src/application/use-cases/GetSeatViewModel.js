import { ValidationError } from '../../domain/errors/DomainError.js';
import { SeatViewStatus } from '../../domain/model/Seat.js';

/**
 * Caso de uso: view model unificado para pintar el bus en una sola llamada.
 *
 * Reemplaza las peticiones paralelas a /disponibles + /holds, y distingue los
 * holds propios del usuario ('miHold') de los de otros ('en_hold'), que es la
 * diferencia que la interfaz necesita para saber qué puede liberar.
 */
export class GetSeatViewModel {
  constructor({ seatRepository, seatLayout, pricingPolicy, clock, holdTtlMs }) {
    this.seatRepository = seatRepository;
    this.seatLayout = seatLayout;
    this.pricingPolicy = pricingPolicy;
    this.clock = clock;
    this.holdTtlMs = holdTtlMs;
  }

  execute({ rutaId, fecha, userId = null }) {
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
      const reservation = this.seatRepository.findReservation(rutaId, fecha, numero);
      const hold = holds.get(numero);

      let estado;
      if (reservation) {
        estado = SeatViewStatus.OCCUPIED;
      } else if (hold) {
        estado = hold.belongsTo(userId) ? SeatViewStatus.HELD_BY_ME : SeatViewStatus.HELD_BY_OTHER;
      } else {
        estado = SeatViewStatus.AVAILABLE;
      }

      return {
        numero,
        estado,
        posicion: this.seatLayout.positionLabel(numero),
        // El holdId solo se revela a su dueño: con él se puede liberar el asiento.
        holdId: hold && hold.belongsTo(userId) ? hold.holdId : null,
        expiresAt: hold ? hold.expiresAt : null,
        remainingMs: hold ? hold.remainingMsAt(now) : null,
      };
    });

    const countBy = (estado) => asientos.filter((a) => a.estado === estado).length;
    const disponibles = asientos
      .filter((a) => a.estado === SeatViewStatus.AVAILABLE)
      .map((a) => a.numero);

    return {
      rutaId,
      fecha,
      userId,
      totalAsientos: this.seatLayout.totalSeats,
      asientos,
      available: disponibles,
      total: disponibles.length,
      resumen: {
        disponibles: disponibles.length,
        enHold: countBy(SeatViewStatus.HELD_BY_OTHER),
        miHold: countBy(SeatViewStatus.HELD_BY_ME),
        ocupados: countBy(SeatViewStatus.OCCUPIED),
      },
      precios: {
        moneda: this.pricingPolicy.currency,
        precioUnitario: this.pricingPolicy.basePrice,
        maxAsientos: this.pricingPolicy.maxSeats,
        descuentoCorporativoDesde: this.pricingPolicy.corporateFrom,
      },
      ttlMs: this.holdTtlMs,
    };
  }
}
