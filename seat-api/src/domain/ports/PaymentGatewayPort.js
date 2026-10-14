/**
 * Puerto de salida: pasarela de pagos.
 *
 * Expresado en términos del negocio ("crear orden", "capturar"), no en términos
 * de PayPal. Por eso el adaptador PayPalPaymentGateway es sustituible por
 * Stripe, Mercado Pago o un doble de pruebas sin que los casos de uso cambien.
 */
export class PaymentGatewayPort {
  /**
   * @param {object} input
   * @param {{valor: string, moneda: string}} input.amount  Vocabulario del dominio;
   *        el adaptador lo traduce a los nombres de su proveedor.
   * @param {string} input.referenceId  Identificador nuestro, viaja a PayPal
   * @param {string} input.description
   * @param {Array}  input.items
   * @param {string} input.returnUrl
   * @param {string} input.cancelUrl
   * @returns {Promise<{orderId: string, status: string, approvalUrl: string|null, raw: object}>}
   */
  createOrder(input) {
    throw new Error('No implementado');
  }

  /** @returns {Promise<{captureId: string, status: string, payer: object|null, raw: object}>} */
  captureOrder(orderId) {
    throw new Error('No implementado');
  }

  /** @returns {Promise<object>} */
  getOrder(orderId) {
    throw new Error('No implementado');
  }

  /** @returns {Promise<boolean>} */
  verifyWebhookSignature(params) {
    throw new Error('No implementado');
  }

  /**
   * Saldo de la cuenta del comercio.
   * @returns {Promise<{cuentaId: string|null, actualizadoEn: string|null, saldos: Array}>}
   */
  getBalances() {
    throw new Error('No implementado');
  }

  /**
   * Movimientos de la cuenta del comercio, con sus comisiones.
   * @returns {Promise<{total: number, comisionesTotales: string, movimientos: Array}>}
   */
  searchTransactions(params) {
    throw new Error('No implementado');
  }

  /** Describe la configuración activa, para el panel de diagnóstico. */
  describe() {
    throw new Error('No implementado');
  }
}
