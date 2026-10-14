/**
 * Precisión de cada moneda.
 *
 * No todas tienen dos decimales: el peso colombiano no usa centavos y el yen
 * tampoco, mientras el dólar sí. Redondear siempre a cero decimales convertía
 * 12,50 USD en 13; redondear siempre a dos dejaba céntimos imposibles en COP.
 *
 * Se consulta a `Intl` en lugar de mantener una tabla a mano: el runtime ya
 * conoce las reglas de cada ISO 4217 y así no hay que recordar los casos raros.
 */
const cache = new Map();

export function currencyDecimals(code) {
  if (cache.has(code)) return cache.get(code);

  let decimals = 2;
  try {
    decimals = new Intl.NumberFormat('en', { style: 'currency', currency: code })
      .resolvedOptions().maximumFractionDigits;
  } catch {
    // Código desconocido: dos decimales es el caso más común.
  }

  cache.set(code, decimals);
  return decimals;
}

/** Redondea a la precisión de la moneda, evitando restos de coma flotante. */
export function roundToCurrency(amount, code) {
  const factor = 10 ** currencyDecimals(code);
  return Math.round(amount * factor) / factor;
}

/** Representación para transporte: cadena con los decimales exactos. */
export function formatAmount(amount, code) {
  return roundToCurrency(amount, code).toFixed(currencyDecimals(code));
}
