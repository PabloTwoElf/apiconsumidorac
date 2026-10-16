import { Router } from 'express';
import { buildAsientosRoutes } from './asientos.routes.js';
import { buildCheckoutRoutes } from './checkout.routes.js';
import { buildReportesRoutes } from './reportes.routes.js';
import { buildAdminRoutes } from './admin.routes.js';

/**
 * Enrutador raíz del API. Agrupa los adaptadores de entrada bajo /api.
 */
export const buildApiRoutes = ({ asientosController, checkoutController, reportesController, adminController }) => {
  const router = Router();

  router.use('/asientos', buildAsientosRoutes(asientosController));
  router.use('/checkout', buildCheckoutRoutes(checkoutController));
  router.use('/reportes', buildReportesRoutes(reportesController));
  router.use('/admin', buildAdminRoutes(adminController));

  return router;
};
