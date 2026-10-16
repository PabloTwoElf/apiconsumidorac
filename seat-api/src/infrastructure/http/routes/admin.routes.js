import { Router } from 'express';

/**
 * Rutas de administración: revisión manual de pagos que PayPal dejó PENDING.
 */
export const buildAdminRoutes = (controller) => {
  const router = Router();

  router.use(controller.requireAdmin);

  /**
   * @swagger
   * /api/admin/pagos-pendientes:
   *   get:
   *     tags: [Admin]
   *     summary: Pagos en revisión manual (captura PENDING en PayPal)
   *     responses:
   *       200: { description: Cola de pagos por aprobar }
   *       401: { description: Falta x-admin-token }
   */
  router.get('/pagos-pendientes', controller.pagosPendientes);

  /**
   * @swagger
   * /api/admin/pagos/{orderId}/aprobar:
   *   post:
   *     tags: [Admin]
   *     summary: Aprobar un pago en revisión y confirmar sus asientos
   *     parameters:
   *       - { in: path, name: orderId, required: true, schema: { type: string } }
   *     responses:
   *       200: { description: Pago aprobado y reservas confirmadas }
   *       409: { description: La orden no está en revisión }
   */
  router.post('/pagos/:orderId/aprobar', controller.aprobar);

  /**
   * @swagger
   * /api/admin/pagos/{orderId}/rechazar:
   *   post:
   *     tags: [Admin]
   *     summary: Rechazar un pago en revisión y liberar sus asientos
   *     parameters:
   *       - { in: path, name: orderId, required: true, schema: { type: string } }
   *     requestBody:
   *       content:
   *         application/json:
   *           schema: { type: object, properties: { motivo: { type: string } } }
   *     responses:
   *       200: { description: Pago rechazado y asientos liberados }
   *       409: { description: La orden no está en revisión }
   */
  router.post('/pagos/:orderId/rechazar', controller.rechazar);

  return router;
};
