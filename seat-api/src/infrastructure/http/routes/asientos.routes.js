import { Router } from 'express';

/**
 * Rutas de asientos. Mantienen las URLs originales para no romper a los
 * clientes existentes; lo nuevo es que /reservar acepta además un arreglo
 * `asientos` para bloquear el carrito completo en una sola llamada atómica.
 */
export const buildAsientosRoutes = (controller) => {
  const router = Router();

  /**
   * @swagger
   * /api/asientos/disponibles:
   *   get:
   *     tags: [Asientos]
   *     summary: Mapa de asientos con estado interno
   *     parameters:
   *       - { in: query, name: rutaId, required: true, schema: { type: string }, example: "123" }
   *       - { in: query, name: fecha, required: true, schema: { type: string, format: date }, example: "2026-10-20" }
   *     responses:
   *       200: { description: Mapa de asientos }
   *       400: { description: Faltan parámetros }
   */
  router.get('/disponibles', controller.disponibles);

  /**
   * @swagger
   * /api/asientos/view-model:
   *   get:
   *     tags: [Asientos]
   *     summary: View model listo para pintar la interfaz
   *     description: >
   *       Reemplaza las llamadas paralelas a /disponibles + /holds. Devuelve cada
   *       asiento como disponible | en_hold | miHold | ocupado. El holdId solo se
   *       revela al usuario dueño del bloqueo (envía userId para recibirlo).
   *     parameters:
   *       - { in: query, name: rutaId, required: true, schema: { type: string }, example: "123" }
   *       - { in: query, name: fecha, required: true, schema: { type: string, format: date }, example: "2026-10-20" }
   *       - { in: query, name: userId, required: false, schema: { type: string }, example: "user-app" }
   *     responses:
   *       200: { description: View model completo con resumen y precios }
   *       400: { description: Faltan parámetros }
   */
  router.get('/view-model', controller.viewModel);

  /**
   * @swagger
   * /api/asientos/reservar:
   *   post:
   *     tags: [Asientos]
   *     summary: Bloquear uno o varios asientos (hold temporal)
   *     description: >
   *       Operación todo-o-nada. Si alguno de los asientos pedidos ya está
   *       tomado, se revierten los bloqueos creados en la misma llamada.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [rutaId, fecha, userId]
   *             properties:
   *               rutaId: { type: string, example: "123" }
   *               fecha: { type: string, format: date, example: "2026-10-20" }
   *               asiento: { type: number, example: 12, description: "Un solo asiento" }
   *               asientos:
   *                 type: array
   *                 items: { type: number }
   *                 example: [12, 13]
   *                 description: "Varios asientos a la vez (tiene prioridad sobre 'asiento')"
   *               userId: { type: string, example: "user-app" }
   *               companyName: { type: string, example: "Viajes Nova S.A.", description: "Obligatorio desde 5 asientos" }
   *     responses:
   *       201: { description: Bloqueos creados, incluye holdIds y el desglose de precio }
   *       400: { description: Datos inválidos }
   *       409: { description: Alguno de los asientos ya está ocupado }
   */
  router.post('/reservar', controller.reservar);

  /**
   * @swagger
   * /api/asientos/holds:
   *   get:
   *     tags: [Asientos]
   *     summary: Listar bloqueos activos
   *     parameters:
   *       - { in: query, name: userId, required: false, schema: { type: string } }
   *       - { in: query, name: rutaId, required: false, schema: { type: string } }
   *       - { in: query, name: fecha, required: false, schema: { type: string, format: date } }
   *     responses:
   *       200: { description: Bloqueos con su tiempo restante }
   *   delete:
   *     tags: [Asientos]
   *     summary: Liberar bloqueos
   *     description: >
   *       Idempotente: liberar un bloqueo ya expirado devuelve 200 con
   *       released=false. Acepta los datos por cuerpo o por query string.
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               holdId: { type: string, description: "Preferido" }
   *               holdIds: { type: array, items: { type: string } }
   *               rutaId: { type: string }
   *               fecha: { type: string, format: date }
   *               asiento: { type: number }
   *               userId: { type: string, description: "Si se envía, solo libera bloqueos de ese usuario" }
   *     responses:
   *       200: { description: Resultado de la liberación }
   *       400: { description: Faltan identificadores }
   */
  router.get('/holds', controller.listarHolds);
  router.delete('/holds', controller.liberarHold);

  /**
   * @swagger
   * /api/asientos/holds/liberar:
   *   post:
   *     tags: [Asientos]
   *     summary: Liberar bloqueos vía POST (para navigator.sendBeacon)
   *     description: >
   *       Mismo comportamiento que DELETE /holds. Existe porque
   *       navigator.sendBeacon solo puede emitir POST y no admite cuerpo JSON:
   *       el frontend lo usa al cerrar la pestaña para no dejar asientos
   *       bloqueados hasta que expiren. Acepta holdIds como lista separada por
   *       comas en la query string.
   *     parameters:
   *       - { in: query, name: holdIds, schema: { type: string }, example: "hold_1,hold_2" }
   *       - { in: query, name: userId, schema: { type: string } }
   *     responses:
   *       200: { description: Resultado de la liberación }
   */
  router.post('/holds/liberar', controller.liberarHold);

  /**
   * @swagger
   * /api/asientos/reservar-definitivo:
   *   post:
   *     tags: [Asientos]
   *     summary: Confirmar reserva sin pasar por pago en línea
   *     description: >
   *       Para venta en taquilla o cortesías. El flujo con PayPal no usa este
   *       endpoint: /api/checkout/capturar-orden confirma las reservas por sí
   *       mismo tras capturar los fondos.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [rutaId, fecha, asiento, holdId]
   *             properties:
   *               rutaId: { type: string }
   *               fecha: { type: string, format: date }
   *               asiento: { type: number }
   *               holdId: { type: string }
   *     responses:
   *       200: { description: Reserva confirmada }
   *       404: { description: El bloqueo no existe o expiró }
   *       409: { description: holdId inválido }
   */
  router.post('/reservar-definitivo', controller.reservarDefinitivo);

  return router;
};
