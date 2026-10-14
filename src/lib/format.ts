/**
 * Formateo para la interfaz.
 */

const formatters = new Map<string, Intl.NumberFormat>();

/**
 * Importes en la moneda del negocio.
 *
 * Los decimales los decide la moneda: el dólar lleva centavos y el peso
 * colombiano no. Antes estaban fijados a cero, lo que mostraba 12,50 USD
 * como «$13».
 *
 * Se cachean los formateadores porque construir un `Intl.NumberFormat` no es
 * gratis y aquí se llama en cada repintado de la lista de precios.
 */
export function money(amount: number, currency = 'USD'): string {
  let formatter = formatters.get(currency);

  if (!formatter) {
    formatter = new Intl.NumberFormat('es-EC', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }

  return formatter.format(amount);
}

/** Cuenta atrás en mm:ss. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Fecha legible a partir de un `yyyy-mm-dd`. */
export function tripDate(iso: string): string {
  // Se parsea a mano: `new Date('2026-10-20')` se interpreta como UTC y en
  // zonas al oeste muestra el día anterior.
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;

  return new Date(year, month - 1, day).toLocaleDateString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Fecha de hoy en `yyyy-mm-dd`, en la zona local. */
export function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
