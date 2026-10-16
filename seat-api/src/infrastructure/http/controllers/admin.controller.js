/**
 * Controlador de administración: cola de pagos en revisión manual.
 *
 * Solo traduce HTTP ↔ ReviewPendingPayment. Si ADMIN_TOKEN está definido,
 * todas las rutas exigen la cabecera `x-admin-token`.
 */
export class AdminController {
  constructor({ useCases, adminToken = '' }) {
    this.useCases = useCases;
    this.adminToken = adminToken;
  }

  requireAdmin = (req, res, next) => {
    if (!this.adminToken || req.headers['x-admin-token'] === this.adminToken) return next();
    res.status(401).json({ ok: false, error: 'Falta o no es válida la cabecera x-admin-token' });
  };

  pagosPendientes = (_req, res, next) => {
    try {
      res.json({ ok: true, ...this.useCases.reviewPendingPayment.listar() });
    } catch (error) {
      next(error);
    }
  };

  aprobar = (req, res, next) => {
    try {
      res.json({ ok: true, ...this.useCases.reviewPendingPayment.aprobar({ orderId: req.params.orderId }) });
    } catch (error) {
      next(error);
    }
  };

  rechazar = (req, res, next) => {
    try {
      const result = this.useCases.reviewPendingPayment.rechazar({
        orderId: req.params.orderId,
        motivo: req.body?.motivo,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
