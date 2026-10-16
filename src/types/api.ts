/**
 * Contratos del Seat API.
 *
 * Espejo de lo que devuelve el backend. Se mantiene en un archivo aparte para
 * que, si el API cambia, TypeScript señale exactamente qué componentes hay que
 * tocar en lugar de fallar en ejecución.
 */

/** Estados que devuelve `/api/asientos/view-model`, pensados para la interfaz. */
export type SeatState = 'disponible' | 'en_hold' | 'miHold' | 'ocupado';

export interface Seat {
  numero: number;
  estado: SeatState;
  posicion: 'Ventana' | 'Pasillo';
  /** Solo viaja si el asiento está bloqueado por el `userId` consultado. */
  holdId: string | null;
  expiresAt: number | null;
  remainingMs: number | null;
}

export interface SeatSummary {
  disponibles: number;
  enHold: number;
  miHold: number;
  ocupados: number;
}

export interface TripPricing {
  moneda: string;
  precioUnitario: number;
  maxAsientos: number;
  descuentoCorporativoDesde: number;
}

export interface ViewModel {
  rutaId: string;
  fecha: string;
  userId: string | null;
  totalAsientos: number;
  asientos: Seat[];
  available: number[];
  total: number;
  resumen: SeatSummary;
  precios: TripPricing;
  ttlMs: number;
}

/** Importe convertido a la moneda con la que se cobra en PayPal. */
export interface Charge {
  moneda: string;
  valor: string;
  tasaConversion: number;
}

export interface Quote {
  cantidad: number;
  moneda: string;
  precioUnitario: number;
  subtotal: number;
  porcentajeDescuento: number;
  montoDescuento: number;
  total: number;
  ahorros: string;
  requiereCompania: boolean;
  cobro: Charge;
}

export interface HoldRef {
  holdId: string;
  asiento: number;
}

export interface HoldResult {
  holdIds: string[];
  asientos: number[];
  holds: HoldRef[];
  expiresAt: number;
  remainingMs: number;
  ttlMs: number;
  pricing: Omit<Quote, 'requiereCompania' | 'cobro'>;
}

export interface OrderResult {
  orderId: string;
  status: string;
  approvalUrl: string | null;
  rutaId: string;
  fecha: string;
  asientos: number[];
  holdIds: string[];
  expiraEn: number;
  pricing: HoldResult['pricing'];
  cobro: Charge;
}

export interface ReservationLine {
  asiento: number;
  estado: string;
  reservedAt?: number;
  /** Presente cuando el bloqueo había expirado pero el asiento seguía libre. */
  nota?: string;
}

export interface ConflictLine {
  asiento: number;
  estado: string;
  motivo: string;
}

export interface CaptureResult {
  orderId: string;
  status: string;
  captureId: string;
  yaProcesada: boolean;
  /** PayPal dejó la captura en PENDING: un administrador debe aprobarla. */
  enRevision?: boolean;
  mensaje?: string;
  asientos: number[];
  reservas: ReservationLine[];
  conflictos: ConflictLine[];
  /** Cobrado, pero algún asiento se perdió: requiere devolución manual. */
  requiereAtencion: boolean;
  pricing: HoldResult['pricing'];
  cobro: Charge;
  payer: { name?: { given_name?: string; surname?: string }; email_address?: string } | null;
}

export interface GatewayConfig {
  clientId: string | null;
  publicBaseUrl: string;
  pasarela: {
    proveedor: string;
    modo: 'sandbox' | 'live';
    configurado: boolean;
    webhookConfigurado: boolean;
  };
}

export interface ReleaseResult {
  released: boolean;
  count: number;
  holds: HoldRef[];
  message: string;
}

/** Códigos estables de error; el texto del mensaje puede cambiar. */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'GATEWAY_ERROR'
  | 'CORS_BLOCKED'
  | 'BAD_JSON'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';
