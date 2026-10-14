import { ValidationError } from '../../domain/errors/DomainError.js';

/**
 * Caso de uso: informe de ventas para el tablero gerencial.
 *
 * Reúne las órdenes del periodo y el estado del inventario, y delega toda la
 * aritmética en el servicio de dominio `SalesReport`. Aquí solo se interpretan
 * los filtros que llegan por HTTP.
 */
export class GetSalesReport {
  constructor({ orderRepository, seatRepository, salesReport, clock }) {
    this.orderRepository = orderRepository;
    this.seatRepository = seatRepository;
    this.salesReport = salesReport;
    this.clock = clock;
  }

  execute({ desde = null, hasta = null, rutaId = null, fecha = null } = {}) {
    const from = this.#parseDate(desde, 'desde');
    // `hasta` llega como día (2026-10-13) y se entiende inclusivo: sin esto, un
    // informe "hasta hoy" dejaría fuera todo lo vendido hoy.
    const to = this.#parseDate(hasta, 'hasta', true);

    if (from && to && from > to) {
      throw new ValidationError('El parámetro "desde" es posterior a "hasta"');
    }

    const now = this.clock.now();
    this.seatRepository.purgeExpiredHolds(now);

    const orders = this.orderRepository.query({ from, to, rutaId, fecha });
    const stats = this.seatRepository.stats();

    // Viajes distintos con actividad: sirve de denominador para la ocupación.
    const trips = new Set(orders.map((order) => `${order.rutaId}|${order.fecha}`));

    return this.salesReport.build({
      orders,
      activeHolds: stats.holdsActivos,
      reservedSeats: stats.reservasConfirmadas,
      tripsTracked: trips.size,
      from: desde ?? null,
      to: hasta ?? null,
    });
  }

  #parseDate(value, label, endOfDay = false) {
    if (!value) return null;

    const date = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999` : value);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError(`El parámetro "${label}" no es una fecha válida`, { [label]: value });
    }

    return date.getTime();
  }
}
