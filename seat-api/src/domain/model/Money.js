import { ValidationError } from '../errors/DomainError.js';
import { formatAmount, roundToCurrency } from './Currency.js';

/**
 * Objeto de valor para importes monetarios.
 *
 * Redondea a la precisión real de su moneda: el dólar admite centavos y el peso
 * colombiano no. Antes se redondeaba siempre a entero, lo que convertía 12,50
 * USD en 13 y hacía imposible trabajar en una moneda con decimales.
 */
export class Money {
  constructor(amount, currency) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      throw new ValidationError(`Importe monetario inválido: ${amount}`);
    }
    this.currency = currency;
    this.amount = roundToCurrency(amount, currency);
    Object.freeze(this);
  }

  /**
   * Convierte a la moneda de cobro aplicando una tasa (unidades locales por 1
   * unidad de la moneda destino).
   *
   * Con la misma moneda y tasa 1 es la identidad, que es el caso cuando el
   * negocio cobra en su propia moneda y no hay nada que convertir.
   *
   * Devuelve `{ valor, moneda }`, el vocabulario del dominio. Traducir eso a
   * los nombres que espera PayPal (`value`, `currency_code`) es trabajo del
   * adaptador de la pasarela: si el dominio los usara, cambiar de proveedor
   * obligaría a tocar entidades y respuestas de la API.
   *
   * El valor va como cadena con los decimales exactos de la moneda porque es un
   * importe a cobrar, y un `number` en coma flotante no representa centavos de
   * forma exacta.
   */
  convertTo(currency, rate) {
    if (typeof rate !== 'number' || rate <= 0) {
      throw new ValidationError(`Tasa de conversión inválida: ${rate}`);
    }

    const converted = currency === this.currency && rate === 1 ? this.amount : this.amount / rate;
    return { valor: formatAmount(converted, currency), moneda: currency };
  }

  toJSON() {
    return { amount: this.amount, currency: this.currency };
  }
}
