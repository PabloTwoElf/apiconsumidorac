/**
 * Controlador de informes para el tablero gerencial.
 *
 * Igual que el resto: solo traduce HTTP ↔ caso de uso. La agregación vive en
 * `domain/services/SalesReport.js`.
 */
export class ReportesController {
  constructor({ useCases }) {
    this.useCases = useCases;
  }

  /** Informe completo: indicadores, desgloses, incidencias y últimas órdenes. */
  resumen = (req, res, next) => {
    try {
      const report = this.useCases.getSalesReport.execute({
        desde: req.query.desde,
        hasta: req.query.hasta,
        rutaId: req.query.rutaId,
        fecha: req.query.fecha,
      });
      res.json({ ok: true, ...report });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Solo los indicadores principales, para las tarjetas del tablero.
   * Se expone aparte porque un panel que refresca cada pocos segundos no
   * necesita arrastrar los desgloses completos en cada llamada.
   */
  kpis = (req, res, next) => {
    try {
      const { ingresos, ordenes, asientos, descuentos, incidencias } =
        this.useCases.getSalesReport.execute({
          desde: req.query.desde,
          hasta: req.query.hasta,
        });

      res.json({
        ok: true,
        ingresos: {
          moneda: ingresos.moneda,
          total: ingresos.total,
          ticketPromedio: ingresos.ticketPromedio,
          cobradoEnPasarela: ingresos.cobradoEnPasarela,
        },
        ordenes: {
          pagadas: ordenes.pagadas,
          pendientes: ordenes.pendientes,
          tasaConversion: ordenes.tasaConversion,
        },
        asientos: {
          vendidos: asientos.vendidos,
          bloqueadosAhora: asientos.bloqueadosAhora,
          ocupacion: asientos.ocupacion,
        },
        descuentoConcedido: descuentos.montoTotal,
        incidencias: incidencias.length,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cuenta de comercio en PayPal: saldo liquidado, movimientos y comisiones.
   *
   * Es la vista "de administrador". Mide algo distinto del informe de ventas:
   * ahí está lo facturado, aquí lo que realmente entró en la cuenta.
   */
  cuentaPasarela = async (req, res, next) => {
    try {
      const result = await this.useCases.getMerchantAccount.execute({
        dias: Number.parseInt(req.query.dias ?? '30', 10),
        incluirMovimientos: req.query.movimientos !== 'false',
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
