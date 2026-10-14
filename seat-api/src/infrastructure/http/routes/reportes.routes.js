import { Router } from 'express';

/**
 * Rutas de informes para el tablero gerencial.
 *
 * Importante sobre el alcance de estos datos: reflejan lo que conoce **este**
 * API, cuyo almacenamiento es en memoria. Sirven como vista operativa en vivo
 * (qué se está vendiendo, ocupación, órdenes en curso), pero no son un
 * histórico: se pierden al reiniciar y en Vercel cada instancia tiene su propia
 * copia. El registro definitivo de las ventas debe vivir en la base de datos
 * del programa principal. Ver CONTEXTO-PROYECTO.md §13.
 */
export const buildReportesRoutes = (controller) => {
  const router = Router();

  /**
   * @swagger
   * /api/reportes/kpis:
   *   get:
   *     tags: [Reportes]
   *     summary: Indicadores principales para las tarjetas del tablero
   *     description: >
   *       Versión reducida del informe, pensada para un panel que refresca a
   *       menudo. Solo cuentan como ingreso las órdenes pagadas.
   *     parameters:
   *       - { in: query, name: desde, schema: { type: string, format: date }, example: "2026-10-01" }
   *       - { in: query, name: hasta, schema: { type: string, format: date }, example: "2026-10-31" }
   *     responses:
   *       200: { description: Indicadores }
   *       400: { description: Rango de fechas inválido }
   */
  router.get('/kpis', controller.kpis);

  /**
   * @swagger
   * /api/reportes/resumen:
   *   get:
   *     tags: [Reportes]
   *     summary: Informe completo de ventas
   *     description: >
   *       Ingresos (solo de órdenes pagadas), embudo de órdenes con tasa de
   *       conversión, ocupación, descuentos concedidos por tramo, desglose por
   *       ruta / fecha de viaje / día de venta, incidencias que requieren
   *       devolución y las diez últimas órdenes.
   *     parameters:
   *       - { in: query, name: desde, schema: { type: string, format: date } }
   *       - { in: query, name: hasta, schema: { type: string, format: date }, description: "Inclusivo" }
   *       - { in: query, name: rutaId, schema: { type: string } }
   *       - { in: query, name: fecha, schema: { type: string, format: date }, description: "Fecha del viaje" }
   *     responses:
   *       200: { description: Informe completo }
   *       400: { description: Rango de fechas inválido }
   */
  router.get('/resumen', controller.resumen);

  /**
   * @swagger
   * /api/reportes/cuenta-pasarela:
   *   get:
   *     tags: [Reportes]
   *     summary: Cuenta de comercio en PayPal (vista de administrador)
   *     description: >
   *       Saldo liquidado, movimientos y comisiones de la cuenta de negocio.
   *       Mide algo distinto del informe de ventas: ahí está lo facturado, aquí
   *       lo que realmente entró en la cuenta, que difiere por las comisiones
   *       de PayPal y por el importe que retiene temporalmente.
   *
   *       El informe de transacciones requiere el permiso "Transaction Search"
   *       activado en la aplicación de PayPal, y en sandbox tarda horas en
   *       poblarse: un resultado vacío no significa que no haya ventas.
   *     parameters:
   *       - { in: query, name: dias, schema: { type: integer, default: 30, maximum: 31 }, description: "PayPal limita cada consulta a 31 días" }
   *       - { in: query, name: movimientos, schema: { type: boolean, default: true }, description: "false devuelve solo el saldo, que es más rápido" }
   *     responses:
   *       200:
   *         description: >
   *           Estado de la cuenta. Cada bloque falla por separado: si el informe
   *           de transacciones no está disponible, el saldo se devuelve igual.
   *       502: { description: PayPal no responde o falta configuración }
   */
  router.get('/cuenta-pasarela', controller.cuentaPasarela);

  return router;
};
