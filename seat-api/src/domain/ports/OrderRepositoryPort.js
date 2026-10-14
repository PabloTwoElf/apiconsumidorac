/**
 * Puerto de salida: persistencia de órdenes de pago.
 *
 * Guarda el vínculo entre una orden de PayPal y los holds de asientos que
 * paga. Sin ese vínculo no se podría confirmar la reserva tras la captura.
 */
export class OrderRepositoryPort {
  /** @returns {import('../model/PaymentOrder.js').PaymentOrder | null} */
  findById(orderId) {
    throw new Error('No implementado');
  }

  save(order) {
    throw new Error('No implementado');
  }

  /** @returns {import('../model/PaymentOrder.js').PaymentOrder[]} */
  listRecent(limit) {
    throw new Error('No implementado');
  }

  /**
   * Órdenes que cumplen unos filtros, para los informes.
   *
   * @param {object} [filters]
   * @param {number} [filters.from]   Marca de tiempo: creadas desde
   * @param {number} [filters.to]     Marca de tiempo: creadas hasta
   * @param {string} [filters.rutaId]
   * @param {string} [filters.fecha]  Fecha del viaje
   * @param {string} [filters.userId]
   * @param {string} [filters.status]
   * @returns {import('../model/PaymentOrder.js').PaymentOrder[]}
   */
  query(filters) {
    throw new Error('No implementado');
  }

  stats() {
    throw new Error('No implementado');
  }
}
