/**
 * Controlador de asientos (la "C" del MVC).
 *
 * Su única responsabilidad es traducir: lee la petición HTTP, invoca el caso de
 * uso y formatea la respuesta. No contiene reglas de negocio — si aquí apareciera
 * un cálculo de precio o una comprobación de disponibilidad, estaría en la capa
 * equivocada.
 *
 * Los errores no se capturan: se delegan a next() para que errorHandler los
 * traduzca en un solo sitio.
 */
export class AsientosController {
  constructor({ useCases }) {
    this.useCases = useCases;
  }

  disponibles = (req, res, next) => {
    try {
      const result = this.useCases.getSeatAvailability.execute({
        rutaId: req.query.rutaId,
        fecha: req.query.fecha,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  viewModel = (req, res, next) => {
    try {
      const result = this.useCases.getSeatViewModel.execute({
        rutaId: req.query.rutaId,
        fecha: req.query.fecha,
        userId: req.query.userId ?? null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  reservar = (req, res, next) => {
    try {
      const result = this.useCases.holdSeats.execute({
        rutaId: req.body.rutaId,
        fecha: req.body.fecha,
        asiento: req.body.asiento,
        asientos: req.body.asientos,
        userId: req.body.userId,
        companyName: req.body.companyName,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  listarHolds = (req, res, next) => {
    try {
      const result = this.useCases.listHolds.execute({
        userId: req.query.userId ?? null,
        rutaId: req.query.rutaId ?? null,
        fecha: req.query.fecha ?? null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  liberarHold = (req, res, next) => {
    try {
      // Se aceptan ambos orígenes: DELETE con cuerpo lo bloquean algunos
      // proxies, así que la query string sirve de alternativa.
      const source = { ...req.query, ...req.body };

      // Por query string los holdIds llegan como "a,b,c": navigator.sendBeacon
      // no puede enviar un cuerpo JSON, y es lo que usa el frontend al cerrar
      // la pestaña para no dejar asientos bloqueados diez minutos.
      const holdIds =
        typeof source.holdIds === 'string'
          ? source.holdIds.split(',').map((id) => id.trim()).filter(Boolean)
          : source.holdIds;

      const result = this.useCases.releaseHold.execute({
        holdId: source.holdId,
        holdIds,
        rutaId: source.rutaId,
        fecha: source.fecha,
        asiento: source.asiento,
        userId: source.userId ?? null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  reservarDefinitivo = (req, res, next) => {
    try {
      const result = this.useCases.confirmReservation.execute({
        rutaId: req.body.rutaId,
        fecha: req.body.fecha,
        asiento: req.body.asiento,
        holdId: req.body.holdId,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  calcularPrecio = (req, res, next) => {
    try {
      const cantidad = req.body?.cantidad ?? req.query?.cantidad;
      const result = this.useCases.calculatePrice.execute({ cantidad });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
