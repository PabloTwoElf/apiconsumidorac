import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/DomainError.js';
import { Reservation } from '../../domain/model/Reservation.js';

/**
 * Caso de uso: convertir un bloqueo en reserva definitiva.
 *
 * Se expone como endpoint propio para flujos sin pago en línea (venta en
 * taquilla, cortesías). El flujo con PayPal no pasa por aquí directamente:
 * CaptureCheckoutOrder reutiliza este mismo caso de uso después de confirmar
 * que los fondos se capturaron, de modo que la regla "un hold válido se
 * convierte en reserva" existe una sola vez.
 */
export class ConfirmReservation {
  constructor({ seatRepository, clock }) {
    this.seatRepository = seatRepository;
    this.clock = clock;
  }

  execute({ rutaId, fecha, asiento, holdId, orderId = null, captureId = null }) {
    if (!rutaId || !fecha || asiento === undefined || asiento === null || !holdId) {
      throw new ValidationError('rutaId, fecha, asiento y holdId son obligatorios');
    }

    const numero = Number(asiento);
    const now = this.clock.now();
    const hold = this.seatRepository.findHold(rutaId, fecha, numero);

    if (!hold) {
      throw new NotFoundError('No existe un bloqueo para ese asiento (puede haber expirado)', {
        rutaId,
        fecha,
        asiento: numero,
      });
    }

    if (hold.holdId !== holdId) {
      throw new ConflictError('El holdId no corresponde al bloqueo de ese asiento', {
        asiento: numero,
      });
    }

    if (hold.isExpiredAt(now)) {
      this.seatRepository.deleteHold(rutaId, fecha, numero);
      throw new ConflictError('El bloqueo expiró; vuelve a seleccionar el asiento', {
        asiento: numero,
      });
    }

    const reservation = new Reservation({
      rutaId,
      fecha,
      asiento: numero,
      userId: hold.userId,
      holdId,
      orderId,
      captureId,
      reservedAt: now,
    });

    this.seatRepository.saveReservation(reservation);
    this.seatRepository.deleteHold(rutaId, fecha, numero);

    return { asiento: numero, reservedAt: now, orderId, captureId };
  }
}
