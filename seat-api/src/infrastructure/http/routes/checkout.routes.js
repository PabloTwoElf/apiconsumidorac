import { Router } from 'express';

/**
 * Rutas de checkout con PayPal Sandbox.
 *
 * El orden de uso desde el programa principal es:
 *   1. POST /api/asientos/reservar      → obtener holdIds
 *   2. POST /api/checkout/crear-orden   → obtener orderId + approvalUrl
 *   3. (el comprador aprueba en PayPal)
 *   4. POST /api/checkout/capturar-orden → cobra y confirma los asientos
 */
export const buildCheckoutRoutes = (controller) => {
  const router = Router();

  /**
   * @swagger
   * /api/checkout/configuracion:
   *   get:
   *     tags: [Checkout PayPal]
   *     summary: Datos públicos de la pasarela
   *     description: >
   *       Devuelve el clientId y el modo (sandbox/live) para que el frontend
   *       cargue el SDK de PayPal sin tener que duplicar la configuración.
   *     responses:
   *       200: { description: Configuración pública }
   */
  router.get('/configuracion', controller.configuracion);

  /**
   * @swagger
   * /api/checkout/crear-orden:
   *   post:
   *     tags: [Checkout PayPal]
   *     summary: Crear la orden de pago para unos asientos bloqueados
   *     description: >
   *       El importe NO se acepta del cliente: se recalcula en el servidor a
   *       partir de los holdIds verificados, aplicando la política de descuentos
   *       y la conversión a la moneda de cobro. Todos los holds deben estar
   *       vigentes, pertenecer al mismo viaje y al mismo userId.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [holdIds, userId]
   *             properties:
   *               holdIds:
   *                 type: array
   *                 items: { type: string }
   *                 example: ["hold_1760000000000_a1b2c3"]
   *               userId: { type: string, example: "user-app" }
   *               returnUrl: { type: string, description: "A dónde vuelve el comprador tras aprobar" }
   *               cancelUrl: { type: string }
   *               descripcion: { type: string, maxLength: 127 }
   *     responses:
   *       201: { description: Orden creada, incluye orderId y approvalUrl }
   *       400: { description: holdIds inválidos o de distinto viaje }
   *       404: { description: Alguno de los bloqueos no existe }
   *       409: { description: Alguno de los bloqueos expiró }
   *       502: { description: PayPal no está disponible o sin credenciales }
   */
  router.post('/crear-orden', controller.crearOrden);

  /**
   * @swagger
   * /api/checkout/capturar-orden:
   *   post:
   *     tags: [Checkout PayPal]
   *     summary: Capturar el pago y confirmar los asientos
   *     description: >
   *       Cobra primero y reserva después. Es idempotente: repetir la llamada
   *       sobre una orden ya pagada devuelve el mismo resultado con
   *       yaProcesada=true, sin cobrar de nuevo. Si algún bloqueo expiró
   *       mientras el comprador estaba en PayPal, el asiento se honra igual
   *       cuando sigue libre; si otro comprador lo tomó, la respuesta trae
   *       requiereAtencion=true con el captureId para gestionar la devolución.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [orderId]
   *             properties:
   *               orderId: { type: string, example: "5O190127TN364715T" }
   *               userId: { type: string, description: "Si se envía, valida que la orden sea suya" }
   *     responses:
   *       200: { description: Pago capturado y asientos reservados }
   *       404: { description: La orden no existe en este sistema }
   *       409: { description: La orden no está pendiente o el pago no se completó }
   *       502: { description: PayPal rechazó la captura }
   */
  router.post('/capturar-orden', controller.capturarOrden);

  /**
   * @swagger
   * /api/checkout/orden/{orderId}:
   *   get:
   *     tags: [Checkout PayPal]
   *     summary: Consultar el estado de una orden
   *     parameters:
   *       - { in: path, name: orderId, required: true, schema: { type: string } }
   *       - { in: query, name: paypal, required: false, schema: { type: boolean }, description: "true consulta también el estado en PayPal" }
   *     responses:
   *       200: { description: Registro de la orden y su historial de eventos }
   *       404: { description: La orden no existe }
   */
  router.get('/orden/:orderId', controller.consultarOrden);

  /**
   * @swagger
   * /api/checkout/webhook:
   *   post:
   *     tags: [Checkout PayPal]
   *     summary: Receptor de webhooks de PayPal
   *     description: >
   *       Red de seguridad del flujo: si el comprador aprueba y cierra el
   *       navegador, CHECKOUT.ORDER.APPROVED dispara la captura desde aquí.
   *       Requiere PAYPAL_WEBHOOK_ID para verificar la firma.
   *     responses:
   *       200: { description: Evento procesado }
   *       400: { description: Firma inválida }
   */
  router.post('/webhook', controller.webhook);

  return router;
};
