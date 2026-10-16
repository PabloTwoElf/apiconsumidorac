import { OrderRepositoryPort } from '../../domain/ports/OrderRepositoryPort.js';

/**
 * Adaptador de persistencia en memoria para órdenes de pago.
 * Mismas limitaciones que InMemorySeatRepository: ver la nota allí.
 */
export class InMemoryOrderRepository extends OrderRepositoryPort {
  constructor() {
    super();
    /** @type {Map<string, import('../../domain/model/PaymentOrder.js').PaymentOrder>} */
    this.orders = new Map();
  }

  findById(orderId) {
    return this.orders.get(orderId) ?? null;
  }

  save(order) {
    this.orders.set(order.orderId, order);
    return order;
  }

  listRecent(limit = 20) {
    return [...this.orders.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  query({ from, to, rutaId, fecha, userId, status } = {}) {
    return [...this.orders.values()]
      .filter((order) => (from ? order.createdAt >= from : true))
      .filter((order) => (to ? order.createdAt <= to : true))
      .filter((order) => (rutaId ? order.rutaId === rutaId : true))
      .filter((order) => (fecha ? order.fecha === fecha : true))
      .filter((order) => (userId ? order.userId === userId : true))
      .filter((order) => (status ? order.status === status : true))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  stats() {
    const orders = [...this.orders.values()];
    return {
      total: orders.length,
      pendientes: orders.filter((o) => o.status === 'pending').length,
      enRevision: orders.filter((o) => o.status === 'en_revision').length,
      pagadas: orders.filter((o) => o.status === 'paid').length,
      fallidas: orders.filter((o) => o.status === 'failed').length,
    };
  }

  reset() {
    this.orders.clear();
  }
}
