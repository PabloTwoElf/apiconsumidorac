/**
 * Caso de uso: cotizar el precio de N asientos.
 *
 * Delega toda la aritmética en PricingPolicy; aquí solo se traduce al
 * vocabulario del contrato HTTP público.
 */
export class CalculatePrice {
  constructor({ pricingPolicy, paymentCurrency, fxRate }) {
    this.pricingPolicy = pricingPolicy;
    this.paymentCurrency = paymentCurrency;
    this.fxRate = fxRate;
  }

  execute({ cantidad }) {
    const quote = this.pricingPolicy.quote(Number(cantidad));
    const paypalAmount = quote.money.convertTo(this.paymentCurrency, this.fxRate);

    return {
      cantidad: quote.quantity,
      moneda: quote.currency,
      precioUnitario: quote.basePrice,
      subtotal: quote.baseTotal,
      porcentajeDescuento: quote.discountPercent,
      montoDescuento: quote.discountAmount,
      total: quote.total,
      ahorros: quote.savings,
      requiereCompania: this.pricingPolicy.requiresCompanyName(quote.quantity),
      // Lo que se le cobraría en PayPal, para que la UI pueda mostrar ambas cifras.
      cobro: { ...paypalAmount, tasaConversion: this.fxRate },
    };
  }
}
