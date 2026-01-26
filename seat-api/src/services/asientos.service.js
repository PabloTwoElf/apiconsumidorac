import { v4 as uuidv4 } from 'uuid';

const SEAT_HOLD_TTL_MS = parseInt(process.env.SEAT_HOLD_TTL_MS || '600000', 10);

// In-memory storage
const holds = new Map();
const reserved = new Map();

const makeKey = (rutaId, fecha, asiento) => `${rutaId}|${fecha}|${asiento}`;

/**
 * Purga todos los holds expirados
 */
export const purgeExpiredHolds = () => {
  const now = Date.now();
  let purged = 0;

  for (const [key, hold] of holds.entries()) {
    if (now > hold.expiresAt) {
      holds.delete(key);
      purged++;
    }
  }

  return purged;
};

/**
 * Obtiene asientos disponibles (no están en hold ni reserved)
 */
export const getAvailableSeats = (rutaId, fecha) => {
  const occupiedSeats = new Set();

  // Buscar holds activos
  for (const [key] of holds) {
    const [r, f, seat] = key.split('|');
    if (r === rutaId && f === fecha) {
      occupiedSeats.add(parseInt(seat, 10));
    }
  }

  // Buscar reservas confirmadas
  for (const [key] of reserved) {
    const [r, f, seat] = key.split('|');
    if (r === rutaId && f === fecha) {
      occupiedSeats.add(parseInt(seat, 10));
    }
  }

  // Retornar asientos disponibles (1-40)
  const available = [];
  for (let i = 1; i <= 40; i++) {
    if (!occupiedSeats.has(i)) {
      available.push(i);
    }
  }

  return available;
};

/**
 * Crea un hold para un asiento
 */
export const createHold = (rutaId, fecha, asiento, userId) => {
  const key = makeKey(rutaId, fecha, asiento);

  // Verificar si ya existe hold o reserva
  if (holds.has(key) || reserved.has(key)) {
    return {
      ok: false,
      error: 'Seat already occupied or on hold',
    };
  }

  const now = Date.now();
  const expiresAt = now + SEAT_HOLD_TTL_MS;
  const holdId = `hold_${now}_${uuidv4()}`;

  holds.set(key, {
    holdId,
    rutaId,
    fecha,
    asiento,
    userId,
    createdAt: now,
    expiresAt,
  });

  return {
    ok: true,
    holdId,
    expiresAt,
    remainingMs: SEAT_HOLD_TTL_MS,
  };
};

/**
 * Obtiene lista de holds activos
 */
export const getHolds = () => {
  const now = Date.now();
  const result = [];

  for (const [key, hold] of holds) {
    const remainingMs = hold.expiresAt - now;

    // Solo incluir holds que no han expirado
    if (remainingMs > 0) {
      result.push({
        holdId: hold.holdId,
        rutaId: hold.rutaId,
        fecha: hold.fecha,
        asiento: hold.asiento,
        userId: hold.userId,
        expiresAt: hold.expiresAt,
        remainingMs,
      });
    }
  }

  return result;
};

/**
 * Libera un hold manualmente
 */
export const releaseHold = (rutaId, fecha, asiento) => {
  const key = makeKey(rutaId, fecha, asiento);

  if (!holds.has(key)) {
    return {
      ok: false,
      error: 'Hold not found',
    };
  }

  holds.delete(key);
  return { ok: true };
};

/**
 * Confirma una reserva (convierte hold a reserved)
 */
export const confirmReservation = (rutaId, fecha, asiento, holdId) => {
  const key = makeKey(rutaId, fecha, asiento);
  const hold = holds.get(key);

  if (!hold) {
    return {
      ok: false,
      error: 'Hold not found',
    };
  }

  if (hold.holdId !== holdId) {
    return {
      ok: false,
      error: 'Invalid hold ID',
    };
  }

  // Mover de holds a reserved
  holds.delete(key);
  const now = Date.now();
  reserved.set(key, {
    holdId,
    rutaId,
    fecha,
    asiento,
    userId: hold.userId,
    reservedAt: now,
  });

  return {
    ok: true,
    reservedAt: now,
  };
};

/**
 * Obtiene estadísticas (para debugging)
 */
export const getStats = () => {
  return {
    holdsCount: holds.size,
    reservedCount: reserved.size,
    totalOccupied: holds.size + reserved.size,
  };
};

export default {
  purgeExpiredHolds,
  getAvailableSeats,
  createHold,
  getHolds,
  releaseHold,
  confirmReservation,
  getStats,
};
