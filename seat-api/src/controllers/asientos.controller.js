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

    const available = asientosService.getAvailableSeats(rutaId, fecha);

    res.json({
      ok: true,
      rutaId,
      fecha,
      available,
      total: available.length,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/asientos/reservar
 * Crea un hold para un asiento
 */
export const createHold = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { rutaId, fecha, asiento, userId } = req.body;

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

    const result = asientosService.createHold(rutaId, fecha, asiento, userId);

    if (!result.ok) {
      return res.status(409).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
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
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/asientos/holds
 * Libera un hold manualmente
 */
export const releaseHold = (req, res) => {
  try {
    asientosService.purgeExpiredHolds();

    const { rutaId, fecha, asiento } = req.body;

    if (!rutaId || !fecha || asiento === undefined) {
      return res.status(400).json({
        ok: false,
        error: 'rutaId, fecha, and asiento are required',
      });
    }

    const result = asientosService.releaseHold(rutaId, fecha, asiento);

    if (!result.ok) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
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

    const result = asientosService.confirmReservation(
      rutaId,
      fecha,
      asiento,
      holdId
    );

    if (!result.ok) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
};
