import type {
  CaptureResult,
  GatewayConfig,
  HoldResult,
  OrderResult,
  Quote,
  ReleaseResult,
  ViewModel,
  ApiErrorCode,
} from '../types/api';

/**
 * Cliente del Seat API.
 *
 * Centraliza tres cosas que no conviene repetir en cada componente: la URL
 * base, el desempaquetado de la envoltura `{ ok, ... }` y la conversión de los
 * errores del servidor en excepciones con un código utilizable.
 */

/**
 * Origen del API.
 *
 * Por defecto vacío, es decir **mismo origen y rutas relativas**, que es lo que
 * funciona en los dos entornos sin configurar nada:
 *   - en desarrollo, el proxy de Vite reenvía /api al puerto donde esté el API
 *     (lo descubre al arrancar; ver vite.config.ts);
 *   - en producción, /api lo sirve la función de api/index.js en este mismo
 *     dominio.
 *
 * `VITE_SEAT_API_URL` sigue teniendo prioridad, para apuntar a un API remota
 * desde una instalación local.
 */
const BASE = (import.meta.env.VITE_SEAT_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Error con el `code` estable del API, para poder decidir según el motivo. */
export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details: unknown;

  constructor(message: string, code: ApiErrorCode, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** Un bloqueo caducado o un asiento tomado se resuelven recargando el mapa. */
  get isStale() {
    return this.code === 'CONFLICT' || this.code === 'NOT_FOUND';
  }
}

/** Vacío significa mismo origen, que es una configuración válida, no un fallo. */
export const isApiConfigured = () => true;

/** Para mostrar al usuario. En mismo origen, el del navegador. */
export const apiBaseUrl = () => BASE || window.location.origin;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    // Una petición abortada no es un fallo: se propaga para que el llamador la ignore.
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      BASE
        ? `No se pudo contactar con el API en ${BASE}.`
        : 'No se pudo contactar con el API. En desarrollo, arráncala con "cd seat-api && npm run dev" y reinicia este servidor para que el proxy la encuentre.',
      'NETWORK_ERROR',
      0
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | ({ ok: boolean; error?: string; code?: ApiErrorCode; details?: unknown } & T)
    | null;

  if (!payload) {
    throw new ApiError(`El API respondió ${res.status} sin cuerpo JSON.`, 'INTERNAL_ERROR', res.status);
  }

  if (!res.ok || payload.ok === false) {
    throw new ApiError(
      payload.error ?? `El API respondió ${res.status}.`,
      payload.code ?? 'INTERNAL_ERROR',
      res.status,
      payload.details
    );
  }

  return payload;
}

export const api = {
  /** Mapa completo del bus. Pasar `userId` para distinguir los bloqueos propios. */
  viewModel: (params: { rutaId: string; fecha: string; userId: string }, signal?: AbortSignal) =>
    request<ViewModel>(`/api/asientos/view-model?${new URLSearchParams(params)}`, { signal }),

  /** Cotiza N asientos. El precio lo decide siempre el servidor. */
  quote: (cantidad: number, signal?: AbortSignal) =>
    request<Quote>('/calcular-precio', { method: 'POST', body: { cantidad }, signal }),

  /** Bloqueo todo-o-nada: si un asiento falla, ninguno queda tomado. */
  hold: (body: {
    rutaId: string;
    fecha: string;
    asientos: number[];
    userId: string;
    companyName?: string;
  }) => request<HoldResult>('/api/asientos/reservar', { method: 'POST', body }),

  release: (body: { holdIds: string[]; userId: string }) =>
    request<ReleaseResult>('/api/asientos/holds', { method: 'DELETE', body }),

  /** Crea la orden en PayPal. No se envía importe: solo los bloqueos. */
  createOrder: (body: { holdIds: string[]; userId: string; returnUrl?: string; cancelUrl?: string }) =>
    request<OrderResult>('/api/checkout/crear-orden', { method: 'POST', body }),

  /** Cobra y confirma los asientos. Idempotente. */
  captureOrder: (body: { orderId: string; userId: string }) =>
    request<CaptureResult>('/api/checkout/capturar-orden', { method: 'POST', body }),

  gatewayConfig: (signal?: AbortSignal) =>
    request<GatewayConfig>('/api/checkout/configuracion', { signal }),

  health: (signal?: AbortSignal) => request<{ status: string }>('/health', { signal }),
};

/**
 * Libera bloqueos al cerrar la pestaña.
 *
 * `fetch` normal se cancela cuando la página se descarga, así que se usa
 * `sendBeacon`, que el navegador entrega en segundo plano. No admite DELETE,
 * de modo que se aprovecha que el API acepta los datos también por query string.
 */
export function releaseOnUnload(holdIds: string[], userId: string) {
  if (!BASE || holdIds.length === 0 || !navigator.sendBeacon) return;
  const q = new URLSearchParams({ holdIds: holdIds.join(','), userId });
  navigator.sendBeacon(`${BASE}/api/asientos/holds/liberar?${q}`);
}
