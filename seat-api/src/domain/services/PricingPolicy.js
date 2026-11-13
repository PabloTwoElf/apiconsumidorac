import { Money } from '../model/Money.js';
import { roundToCurrency } from '../model/Currency.js';
import { ValidationError } from '../errors/DomainError.js';

/**
 * Política de precios y descuentos por volumen.
 *
 * Regla de negocio pura: no toca HTTP, ni base de datos, ni PayPal. Es la única
 * fuente de verdad del precio — tanto el endpoint /calcular-precio como la
 * creación de la orden de PayPal pasan por aquí, de modo que el importe que ve
 * el usuario y el que se cobra no pueden divergir.
 */
export class PricingPolicy {
  /**
   * @param {object} config
   * @param {number} config.basePrice      Precio unitario en moneda local
   * @param {string} config.currency       Moneda local (ej. COP)
   * @param {object} config.discountTiers  { cantidadMínima: fracciónDescuento }
   * @param {number} config.maxSeats       Máximo de asientos por reserva
   * @param {number} config.corporateFrom  Desde cuántos asientos se exige razón social
   */
  constructor({ basePrice, currency, discountTiers, maxSeats, corporateFrom }) {
    this.basePrice = basePrice;
    this.currency = currency;
    this.discountTiers = discountTiers;
    this.maxSeats = maxSeats;
    this.corporateFrom = corporateFrom;
  }

  /**
   * Devuelve el porcentaje de descuento aplicable a una cantidad.
   * Se elige el tramo más alto que la cantidad alcanza, así añadir tramos nuevos
   * no obliga a reescribir la cadena de comparaciones.
   */
  discountPercentFor(quantity) {
    const applicable = Object.keys(this.discountTiers)
      .map(Number)
      .filter((threshold) => quantity >= threshold)
      .sort((a, b) => b - a)[0];

    if (!applicable) return 0;

    // Se redondea porque 0.07 * 100 da 7.000000000000001 en coma flotante, y ese
    // valor acabaría impreso tal cual en la respuesta de la API.
    return Math.round(this.discountTiers[applicable] * 10_000) / 100;
  }

  /**
   * Valida un precio unitario enviado por el consumidor (precio de la ruta).
   * Devuelve null cuando no se envió, para usar el BASE_PRICE del API.
   */
  resolveUnitPrice(unitPrice) {
    if (unitPrice === undefined || unitPrice === null || unitPrice === '') return null;
    const parsed = Number(unitPrice);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > PricingPolicy.MAX_UNIT_PRICE) {
      throw new ValidationError(
        `precioUnitario debe ser un número mayor a 0 y menor o igual a ${PricingPolicy.MAX_UNIT_PRICE}`,
        { precioUnitario: unitPrice }
      );
    }
    return roundToCurrency(parsed, this.currency);
  }

  /**
   * Desglose completo del precio para una cantidad de asientos.
   *
   * `unitPrice` permite cotizar con el precio de la ruta que fija la aplicación
   * consumidora (CulturalTrip guarda un precio por ruta, p. ej. 18 USD para
   * Guayaquil–Quito). Sin él se usa el BASE_PRICE del API. La tabla de
   * descuentos y el redondeo son los mismos en ambos casos, así que lo que ve el
   * comprador y lo que cobra PayPal siguen saliendo de esta única función.
   */
  quote(quantity, { unitPrice = null } = {}) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError('La cantidad de asientos debe ser un entero mayor a 0');
    }
    if (quantity > this.maxSeats) {
      throw new ValidationError(
        `No se pueden reservar más de ${this.maxSeats} asientos en una sola operación`,
        { maxSeats: this.maxSeats }
      );
    }

    const basePrice = this.resolveUnitPrice(unitPrice) ?? this.basePrice;

    // Cada paso se redondea a la precisión de la moneda. Sin eso, un descuento
    // del 7 % sobre 37,50 USD deja importes de tres decimales que PayPal
    // rechaza y que no se pueden cobrar.
    const baseTotal = roundToCurrency(basePrice * quantity, this.currency);
    const discountPercent = this.discountPercentFor(quantity);
    const discountAmount = roundToCurrency((baseTotal * discountPercent) / 100, this.currency);
    const total = roundToCurrency(baseTotal - discountAmount, this.currency);

    const formatted = new Intl.NumberFormat('es-EC', {
      style: 'currency',
      currency: this.currency,
    });

    return {
      quantity,
      currency: this.currency,
      basePrice,
      // Indica si el precio vino de la ruta (consumidor) o del BASE_PRICE del API.
      priceSource: basePrice === this.basePrice ? 'api' : 'ruta',
      baseTotal,
      discountPercent,
      discountAmount,
      total,
      savings: discountAmount > 0 ? `Ahorras: ${formatted.format(discountAmount)}` : '',
      money: new Money(total, this.currency),
    };
  }

  /** Tope de cordura para un precio unitario enviado por el consumidor. */
  static MAX_UNIT_PRICE = 10_000;

  /** Una reserva corporativa necesita razón social para justificar el descuento. */
  requiresCompanyName(quantity) {
    return quantity >= this.corporateFrom;
  }
}
