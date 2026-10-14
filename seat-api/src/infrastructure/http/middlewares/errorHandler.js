import { DomainError } from '../../../domain/errors/DomainError.js';

/**
 * Traductor de errores de dominio a respuestas HTTP.
 *
 * Es el único punto que conoce ambos mundos: el dominio lanza errores con un
 * `code` semántico y aquí se decide el status. Así los casos de uso nunca
 * mencionan números HTTP.
 */
const STATUS_BY_CODE = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GATEWAY_ERROR: 502,
  DOMAIN_ERROR: 400,
};

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    sugerencia: 'Consulta la documentación en /api-docs',
  });
};

export const errorHandler = (logger = console) => (err, req, res, _next) => {
  if (err instanceof DomainError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    if (status >= 500) logger.error(`[${err.code}] ${err.message}`);
    return res.status(status).json({
      ok: false,
      error: err.message,
      code: err.code,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  // CORS rechaza con un Error normal; merece 403 y no 500.
  if (err?.message?.startsWith('CORS')) {
    return res.status(403).json({ ok: false, error: err.message, code: 'CORS_BLOCKED' });
  }

  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ ok: false, error: 'JSON malformado en el cuerpo de la petición', code: 'BAD_JSON' });
  }

  logger.error('[error-no-controlado]', err);
  res.status(500).json({
    ok: false,
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR',
    // El detalle solo en desarrollo: en producción filtraría rutas internas.
    ...(process.env.NODE_ENV !== 'production' ? { detalle: err?.message } : {}),
  });
};
