/**
 * Caso de uso: listar bloqueos activos.
 *
 * Pensado para diagnóstico y para el panel. Admite filtrar por usuario o viaje
 * porque devolver todos los holds del sistema expone qué compra cada usuario.
 */
export class ListHolds {
  constructor({ seatRepository, clock }) {
    this.seatRepository = seatRepository;
    this.clock = clock;
  }

  execute({ userId = null, rutaId = null, fecha = null } = {}) {
    const now = this.clock.now();
    this.seatRepository.purgeExpiredHolds(now);

    const holds = this.seatRepository
      .listActiveHolds()
      .filter((hold) => !hold.isExpiredAt(now))
      .filter((hold) => (userId ? hold.userId === userId : true))
      .filter((hold) => (rutaId ? hold.rutaId === rutaId : true))
      .filter((hold) => (fecha ? hold.fecha === fecha : true))
      .map((hold) => ({
        holdId: hold.holdId,
        rutaId: hold.rutaId,
        fecha: hold.fecha,
        asiento: hold.asiento,
        userId: hold.userId,
        companyName: hold.companyName,
        expiresAt: hold.expiresAt,
        remainingMs: hold.remainingMsAt(now),
      }))
      .sort((a, b) => a.asiento - b.asiento);

    return { holds, count: holds.length };
  }
}
