import { NotFoundError, ValidationError } from '../../domain/errors/DomainError.js';

/**
 * Caso de uso: consultar el estado de una orden.
 *
 * Devuelve nuestro registro y, opcionalmente, el estado que reporta PayPal.
 * Sirve al programa principal para reconciliar cuando el navegador del
 * comprador se cerró entre la aprobación y la captura.
 */
export class GetCheckoutOrder {
  constructor({ orderRepository, paymentGateway }) {
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
  }

  async execute({ orderId, incluirPaypal = false }) {
    if (!orderId) {
      throw new ValidationError('orderId es obligatorio');
    }

    const order = this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError('La orden no existe en este sistema', { orderId });
    }

    const result = { orden: order.toJSON() };

    if (incluirPaypal) {
      try {
        result.paypal = await this.paymentGateway.getOrder(orderId);
      } catch (error) {
        // Que PayPal no responda no debe impedir ver nuestro propio registro.
        result.paypal = { error: error.message };
      }
    }

    return result;
  }
}
