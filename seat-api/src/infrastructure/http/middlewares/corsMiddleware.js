import cors from 'cors';

/**
 * CORS con dos reglas que importan para este despliegue:
 *
 *  - Las peticiones sin Origin (Postman, curl, webhooks de PayPal) pasan: no
 *    son peticiones de navegador y la política no aplica.
 *  - Los subdominios de previsualización de Vercel se aceptan por patrón. Cada
 *    push genera una URL nueva (proyecto-git-rama-usuario.vercel.app), y sin
 *    esto habría que editar ALLOWED_ORIGINS en cada despliegue.
 */
/** Cualquier puerto de localhost o 127.0.0.1, con o sin esquema https. */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

export const buildCors = ({ allowedOrigins, nodeEnv, logger = console }) => {
  const patterns = allowedOrigins
    .filter((origin) => origin.includes('*'))
    .map((origin) => new RegExp(`^${origin.replace(/[.]/g, '\\.').replace(/\*/g, '.*')}$`));

  const exact = new Set(allowedOrigins.filter((origin) => !origin.includes('*')));
  const permitAll = allowedOrigins.includes('*');

  /**
   * Fuera de producción se acepta cualquier puerto de localhost.
   *
   * Los puertos de desarrollo no son estables —Vite incrementa el suyo cuando
   * está ocupado— y obligar a actualizar ALLOWED_ORIGINS en cada arranque solo
   * produce fallos de CORS difíciles de diagnosticar. En producción esta puerta
   * está cerrada: ahí solo valen los orígenes de la lista.
   *
   * Antes se permitía *cualquier* origen cuando la lista estaba vacía, lo que
   * convertía un fallo al cargar el .env en un CORS abierto de par en par sin
   * ningún síntoma visible.
   */
  const permitLocalhost = nodeEnv !== 'production';

  if (permitLocalhost) {
    logger.warn('[CORS] Modo desarrollo: se acepta cualquier puerto de localhost.');
  }

  return cors({
    origin: (origin, callback) => {
      // Sin cabecera Origin no es una petición de navegador (Postman, curl, los
      // webhooks de PayPal) y la política no aplica.
      if (!origin) return callback(null, true);
      if (permitAll) return callback(null, true);
      if (exact.has(origin)) return callback(null, true);
      if (patterns.some((pattern) => pattern.test(origin))) return callback(null, true);
      if (permitLocalhost && LOCALHOST.test(origin)) return callback(null, true);
      // Las URLs de previsualización de Vercel cambian en cada push; sin esto
      // habría que editar ALLOWED_ORIGINS en cada despliegue.
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)) return callback(null, true);

      logger.warn(`[CORS] Origen bloqueado: ${origin}`);
      return callback(new Error(`CORS: origen no permitido (${origin})`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'paypal-auth-algo',
      'paypal-cert-url',
      'paypal-transmission-id',
      'paypal-transmission-sig',
      'paypal-transmission-time',
    ],
    optionsSuccessStatus: 200,
  });
};
