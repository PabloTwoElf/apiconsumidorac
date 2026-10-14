import { money } from '../lib/format';
import type { Quote } from '../types/api';

interface Props {
  quote: Quote | null;
  loading: boolean;
}

/**
 * Desglose del precio tal y como lo devolvió el servidor.
 *
 * Se muestran las dos cifras — el total en la moneda del negocio y lo que se
 * cobrará en PayPal — porque son distintas y ocultar la segunda sorprendería al
 * comprador en la pasarela.
 */
export function PriceBreakdown({ quote, loading }: Props) {
  if (!quote) {
    return (
      <div className="price" aria-busy={loading}>
        <div className="skeleton" style={{ height: 14 }} />
        <div className="skeleton" style={{ height: 14, width: '70%' }} />
      </div>
    );
  }

  return (
    <>
      <dl className="price">
        <div className="price__row">
          <dt>Asientos</dt>
          <dd>{quote.cantidad}</dd>
        </div>
        <div className="price__row">
          <dt>Precio unitario</dt>
          <dd>{money(quote.precioUnitario, quote.moneda)}</dd>
        </div>
        <div className="price__row">
          <dt>Subtotal</dt>
          <dd>{money(quote.subtotal, quote.moneda)}</dd>
        </div>

        {quote.porcentajeDescuento > 0 && (
          <div className="price__row price__row--save">
            <dt>Descuento {quote.porcentajeDescuento} %</dt>
            <dd>−{money(quote.montoDescuento, quote.moneda)}</dd>
          </div>
        )}
      </dl>

      <div className="price__total">
        <span className="price__total-label">Total</span>
        <span className="price__amount">{money(quote.total, quote.moneda)}</span>
      </div>

      <div className="price__charge">
        Se cobrarán {quote.cobro.valor} {quote.cobro.moneda} en PayPal
      </div>
    </>
  );
}
