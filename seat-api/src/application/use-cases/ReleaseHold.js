import { ValidationError } from '../../domain/errors/DomainError.js';

/**
 * Caso de uso: liberar un bloqueo antes de que expire.
 *
 * Acepta holdId (preferido), varios holdIds, o la terna rutaId+fecha+asiento.
 * Es idempotente: liberar un hold ya expirado o inexistente no es un error,
 * porque el cliente suele llamar aquí al abandonar el carrito y no puede saber
 * si el temporizador ya venció.
 */
export class ReleaseHold {
  constructor({ seatRepository, clock }) {
    this.seatRepository = seatRepository;
    this.clock = clock;
  }

  execute({ holdId, holdIds, rutaId, fecha, asiento, userId = null }) {
    const now = this.clock.now();
    this.seatRepository.purgeExpiredHolds(now);

    const ids = [holdId, ...(Array.isArray(holdIds) ? holdIds : [])].filter(Boolean);

    if (ids.length > 0) {
      const released = [];
      for (const id of ids) {
        const hold = this.seatRepository.findHoldById(id);
        if (!hold) continue;

        // Si el llamador se identifica, solo puede liberar lo que es suyo.
        if (userId && hold.userId !== userId) {
          throw new ValidationError('El bloqueo pertenece a otro usuario', { holdId: id });
        }

        this.seatRepository.deleteHold(hold.rutaId, hold.fecha, hold.asiento);
        released.push({ holdId: id, asiento: hold.asiento });
      }

      return {
        released: released.length > 0,
        count: released.length,
        holds: released,
        message:
          released.length > 0
            ? `${released.length} bloqueo(s) liberado(s)`
            : 'No había bloqueos activos con esos identificadores (pueden haber expirado)',
      };
    }

    if (!rutaId || !fecha || asiento === undefined || asiento === null) {
      throw new ValidationError('Debes enviar holdId (o holdIds) o la combinación rutaId, fecha y asiento');
    }

    const numero = Number(asiento);
    const hold = this.seatRepository.findHold(rutaId, fecha, numero);

    if (!hold) {
      return {
        released: false,
        count: 0,
        holds: [],
        message: 'No había un bloqueo activo para ese asiento (puede haber expirado)',
      };
    }

    if (userId && hold.userId !== userId) {
      throw new ValidationError('El bloqueo pertenece a otro usuario', { asiento: numero });
    }

    this.seatRepository.deleteHold(rutaId, fecha, numero);

    return {
      released: true,
      count: 1,
      holds: [{ holdId: hold.holdId, asiento: numero }],
      message: 'Bloqueo liberado',
    };
  }
}
