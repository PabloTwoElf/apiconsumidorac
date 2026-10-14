import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/**
 * Carga del .env.
 *
 * Se resuelve desde la ubicación de este módulo y no desde el directorio de
 * trabajo, porque el API se arranca desde dos sitios distintos: `seat-api/`
 * (servidor local) y la raíz del repositorio (la función de Vercel que sirve
 * el API bajo /api). Con `dotenv.config()` a secas, el arranque desde la raíz
 * no encontraba `seat-api/.env` y el API quedaba sin ALLOWED_ORIGINS — lo que
 * no provocaba un error visible, sino algo peor: CORS pasaba a aceptar
 * cualquier origen, porque una lista vacía en desarrollo significa "permitir
 * todo".
 *
 * El orden importa: dotenv nunca sobrescribe una variable ya definida, así que
 * las del panel de Vercel o Render siguen teniendo prioridad sobre el archivo.
 */
const seatApiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

dotenv.config({ path: path.join(seatApiRoot, '.env') });
dotenv.config();

const num = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const float = (value, fallback) => {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * En Vercel el host público se conoce solo en ejecución. VERCEL_URL llega sin
 * esquema, así que se normaliza aquí para que las return_url que recibe PayPal
 * sean absolutas.
 */
const resolvePublicBaseUrl = (port) => {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  return `http://localhost:${port}`;
};

const PORT = num(process.env.PORT, 5008);

export const env = Object.freeze({
  PORT,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  // Vercel y Render ponen esta variable; sirve para no arrancar temporizadores
  // que en serverless no tienen sentido.
  IS_SERVERLESS: Boolean(process.env.VERCEL),
  PUBLIC_BASE_URL: resolvePublicBaseUrl(PORT),
  ALLOWED_ORIGINS: list(process.env.ALLOWED_ORIGINS),

  // A dónde se devuelve al comprador después de pagar. PayPal siempre retorna
  // al propio API (/checkout/retorno), y el API reenvía aquí: así la URL que
  // queda registrada en cada orden de PayPal no depende de dónde esté alojada
  // la aplicación, y cambiar de destino no obliga a recrear órdenes.
  // Vacío = se queda en el panel del propio API.
  APP_RETURN_BASE_URL: (process.env.APP_RETURN_BASE_URL ?? '').replace(/\/$/, ''),
  APP_RETURN_PATH: process.env.APP_RETURN_PATH ?? '/seat-booking',

  // Asientos
  SEAT_HOLD_TTL_MS: num(process.env.SEAT_HOLD_TTL_MS, 600_000),
  PURGE_INTERVAL_MS: num(process.env.PURGE_INTERVAL_MS, 120_000),
  TOTAL_SEATS: num(process.env.TOTAL_SEATS, 40),
  SEATS_PER_ROW: num(process.env.SEATS_PER_ROW, 4),

  // Precios. Por defecto USD, que es la moneda de Ecuador y la única que tiene
  // la cuenta de negocio de PayPal: cotizar en otra obligaba a convertir y
  // producía importes que no cuadraban con lo que se cobra.
  // Se lee como decimal: USD tiene centavos.
  BASE_PRICE: float(process.env.BASE_PRICE, 12.5),
  PRICE_CURRENCY: process.env.PRICE_CURRENCY ?? 'USD',
  MAX_SEATS_PER_BOOKING: num(process.env.MAX_SEATS_PER_BOOKING, 10),
  CORPORATE_DISCOUNT_FROM: num(process.env.CORPORATE_DISCOUNT_FROM, 5),

  // PayPal
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ?? '',
  PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET ?? '',
  PAYPAL_MODE: process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
  PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID ?? '',
  PAYPAL_BRAND_NAME: process.env.PAYPAL_BRAND_NAME ?? 'CulturalTrip',
  // Moneda con la que se cobra en PayPal y cuántas unidades de la moneda del
  // negocio equivalen a una de esta. Con la misma moneda y tasa 1 no hay
  // conversión, que es el caso normal: la cuenta de negocio liquida en USD.
  // Solo hay que cambiarlo si se cotiza en una moneda que PayPal no soporta.
  PAYMENT_CURRENCY: process.env.PAYMENT_CURRENCY ?? 'USD',
  PAYMENT_FX_RATE: float(process.env.PAYMENT_FX_RATE, 1),
});

/**
 * Avisos de configuración. No se aborta el arranque: el API de asientos debe
 * funcionar aunque PayPal no esté configurado todavía.
 */
export const configWarnings = () => {
  const warnings = [];

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    warnings.push('PayPal sin credenciales: los endpoints de /api/checkout devolverán error 502.');
  }
  if (env.PAYPAL_MODE === 'live' && !env.PAYPAL_WEBHOOK_ID) {
    warnings.push('PAYPAL_MODE=live sin PAYPAL_WEBHOOK_ID: los webhooks no se verificarían.');
  }
  if (env.NODE_ENV === 'production' && env.ALLOWED_ORIGINS.length === 0) {
    warnings.push('Producción sin ALLOWED_ORIGINS: se rechazarán las peticiones del navegador.');
  }

  // Una tasa de 1 entre monedas distintas significa que se cobraría el importe
  // sin convertir: 50 000 COP se cobrarían como 50 000 USD.
  if (env.PRICE_CURRENCY !== env.PAYMENT_CURRENCY && env.PAYMENT_FX_RATE === 1) {
    warnings.push(
      `Se cotiza en ${env.PRICE_CURRENCY} y se cobra en ${env.PAYMENT_CURRENCY} con tasa 1: ` +
        'el importe se cobraría sin convertir. Ajusta PAYMENT_FX_RATE.'
    );
  }

  return warnings;
};
