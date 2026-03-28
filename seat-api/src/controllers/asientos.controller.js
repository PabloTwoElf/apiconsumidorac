import * as asientosService from '../services/asientos.service.js';

/**
 * GET /api/asientos/disponibles
 * Obtiene asientos disponibles para una ruta y fecha
 */
export const getAvailableSeats = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { rutaId, fecha } = req.query;

    if (!rutaId || !fecha) {
      return res.status(400).json({
        ok: false,
        error: 'rutaId and fecha query parameters are required',
      });
    }

    const asientos = asientosService.getSeatMap(rutaId, fecha);
    const available = asientos
      .filter((seat) => seat.estado === 'available')
      .map((seat) => seat.numero);

    res.json({
      ok: true,
      rutaId,
      fecha,
      ttlMs: asientosService.SEAT_HOLD_TTL_MS,
      asientos,
      available,
      total: available.length,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * GET /api/asientos/view-model
 * Endpoint unificado para la interfaz visual.
 * Devuelve el estado completo de todos los asientos en una sola llamada,
 * con etiquetas amigables: disponible | en_hold | miHold | ocupado.
 * Opcional: pasar userId para identificar los holds propios.
 */
export const getViewModel = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { rutaId, fecha, userId } = req.query;

    if (!rutaId || !fecha) {
      return res.status(400).json({
        ok: false,
        error: 'rutaId and fecha query parameters are required',
      });
    }

    const seatMap = asientosService.getSeatMap(rutaId, fecha);
    const allHolds = asientosService.getHolds();
    const holdsForRoute = allHolds.filter(
      (h) => h.rutaId === rutaId && h.fecha === fecha
    );

    const now = Date.now();

    const asientos = seatMap.map((seat) => {
      const hold = holdsForRoute.find((h) => h.asiento === seat.numero);

      let estado;
      if (seat.estado === 'available') {
        estado = 'disponible';
      } else if (seat.estado === 'reserved') {
        estado = 'ocupado';
      } else if (hold) {
        estado = userId && hold.userId === userId ? 'miHold' : 'en_hold';
      } else {
        estado = 'en_hold';
      }

      return {
        numero: seat.numero,
        estado,
        holdId: hold ? hold.holdId : null,
        expiresAt: hold ? hold.expiresAt : null,
        remainingMs: hold ? Math.max(0, hold.expiresAt - now) : null,
      };
    });

    const disponiblesCount = asientos.filter((a) => a.estado === 'disponible').length;
    const enHoldCount = asientos.filter((a) => a.estado === 'en_hold').length;
    const miHoldCount = asientos.filter((a) => a.estado === 'miHold').length;
    const ocupadosCount = asientos.filter((a) => a.estado === 'ocupado').length;

    res.json({
      ok: true,
      rutaId,
      fecha,
      totalAsientos: 40,
      asientos,
      available: asientos.filter((a) => a.estado === 'disponible').map((a) => a.numero),
      total: disponiblesCount,
      resumen: {
        disponibles: disponiblesCount,
        enHold: enHoldCount,
        miHold: miHoldCount,
        ocupados: ocupadosCount,
      },
      ttlMs: asientosService.SEAT_HOLD_TTL_MS,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * POST /api/asientos/reservar
 * Crea un hold para un asiento
 */
export const createHold = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { rutaId, fecha, asiento, userId, companyName } = req.body;

    if (!rutaId || !fecha || asiento === undefined || !userId) {
      return res.status(400).json({
        ok: false,
        error: 'rutaId, fecha, asiento, and userId are required',
      });
    }

    if (isNaN(asiento) || asiento < 1 || asiento > 40) {
      return res.status(400).json({
        ok: false,
        error: 'asiento must be a number between 1 and 40',
      });
    }

    const result = asientosService.createHold(rutaId, fecha, asiento, userId, companyName);

    if (!result.ok) {
      return res.status(409).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * GET /api/asientos/holds
 * Obtiene lista de holds activos
 */
export const getHolds = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const holds = asientosService.getHolds();

    res.json({
      ok: true,
      holds,
      count: holds.length,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * DELETE /api/asientos/holds
 * Libera un hold manualmente.
 * Acepta holdId (preferido) o (rutaId + fecha + asiento).
 */
export const releaseHold = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { holdId, rutaId, fecha, asiento } = req.body;

    // Priorizar holdId: buscar el hold y eliminarlo por sus coordenadas
    if (holdId) {
      const holds = asientosService.getHolds();
      const holdToDelete = holds.find((h) => h.holdId === holdId);
      if (holdToDelete) {
        const result = asientosService.releaseHold(
          holdToDelete.rutaId,
          holdToDelete.fecha,
          holdToDelete.asiento
        );
        if (!result.ok) return res.status(409).json(result);
        return res.json(result);
      }
      // holdId no encontrado pero no es error crítico (puede ya haber expirado)
      return res.json({ ok: true, released: false, message: 'Hold not found (may have already expired)' });
    }

    // Fallback: usar rutaId + fecha + asiento
    if (!rutaId || !fecha || asiento === undefined) {
      return res.status(400).json({
        ok: false,
        error: 'holdId or (rutaId, fecha, asiento) are required',
      });
    }

    const result = asientosService.releaseHold(rutaId, fecha, asiento);

    if (!result.ok) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};

/**
 * POST /api/asientos/reservar-definitivo
 * Confirma una reserva (convierte hold a reserved)
 */
export const confirmReservation = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { rutaId, fecha, asiento, holdId } = req.body;

    if (!rutaId || !fecha || asiento === undefined || !holdId) {
      return res.status(400).json({
        ok: false,
        error: 'rutaId, fecha, asiento, and holdId are required',
      });
    }

    const result = asientosService.confirmReservation(rutaId, fecha, asiento, holdId);

    if (!result.ok) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
};
