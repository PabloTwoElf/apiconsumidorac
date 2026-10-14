import { useState } from 'react';
import { HoldTimer } from './HoldTimer';
import { PayPalCheckout } from './PayPalCheckout';
import { PriceBreakdown } from './PriceBreakdown';
import { Receipt } from './Receipt';
import { Stepper } from './Stepper';
import { useCountdown } from '../hooks/useCountdown';
import type { Phase } from '../hooks/useCheckout';
import type { CaptureResult, GatewayConfig, HoldResult, Quote, TripPricing } from '../types/api';

interface Props {
  phase: Phase;
  selected: number[];
  hold: HoldResult | null;
  receipt: CaptureResult | null;
  quote: Quote | null;
  quoteLoading: boolean;
  tripPricing: TripPricing | null;
  gateway: GatewayConfig | null;
  fecha: string;
  onRemoveSeat: (numero: number) => void;
  onClear: () => void;
  onHold: (companyName?: string) => void;
  onCreateOrder: () => Promise<string>;
  onApprove: (orderId: string) => Promise<void>;
  onCancelPayment: () => void;
  onPaymentError: (message: string) => void;
  onRelease: () => void;
  onExpire: () => void;
  onNew: () => void;
}

/**
 * Carril derecho: carrito, pago y comprobante.
 *
 * Es el componente que cambia de cara según la fase. Se mantienen juntos porque
 * comparten el mismo contexto (los asientos elegidos y su precio) y separarlos
 * obligaría a pasar el mismo puñado de props tres veces.
 */
export function CheckoutPanel({
  phase,
  selected,
  hold,
  receipt,
  quote,
  quoteLoading,
  tripPricing,
  gateway,
  fecha,
  onRemoveSeat,
  onClear,
  onHold,
  onCreateOrder,
  onApprove,
  onCancelPayment,
  onPaymentError,
  onRelease,
  onExpire,
  onNew,
}: Props) {
  const [company, setCompany] = useState('');
  const [companyTouched, setCompanyTouched] = useState(false);

  const remaining = useCountdown(hold?.expiresAt ?? null, onExpire);

  // ---- Compra terminada ----
  if (phase === 'done' && receipt) {
    return (
      <section className="glass panel" aria-label="Comprobante de compra">
        <Receipt
          receipt={receipt}
          fecha={fecha}
          onNew={() => {
            setCompany('');
            setCompanyTouched(false);
            onNew();
          }}
        />
      </section>
    );
  }

  const holding = phase === 'holding';
  const capturing = phase === 'capturing';
  const paying = phase === 'held' || capturing;

  // Durante el pago manda la lista de asientos bloqueados; antes, la selección.
  const seats = paying && hold ? hold.asientos : selected;
  const needsCompany = Boolean(quote?.requiereCompania);
  const companyMissing = needsCompany && company.trim().length === 0;

  // ---- Carrito vacío ----
  if (seats.length === 0) {
    return (
      <section className="glass panel" aria-label="Tu reserva">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">
              <span aria-hidden="true">🛒</span> Tu reserva
            </h2>
            <p className="panel__sub">Elige asientos en el mapa</p>
          </div>
        </div>

        <Stepper phase={phase} />

        <div className="empty">
          <span className="empty__icon" aria-hidden="true">
            🎟️
          </span>
          Toca los asientos libres del bus para empezar.
          {tripPricing && (
            <div style={{ marginTop: 8 }}>
              Hasta {tripPricing.maxAsientos} por reserva, con descuentos desde 2 asientos.
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="glass panel" aria-label="Tu reserva">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">
            <span aria-hidden="true">🛒</span> Tu reserva
          </h2>
          <p className="panel__sub">
            {seats.length} asiento{seats.length === 1 ? '' : 's'} · {paying ? 'listo para pagar' : 'sin bloquear'}
          </p>
        </div>
      </div>

      <Stepper phase={phase} />

      {paying && hold && <HoldTimer remainingMs={remaining} totalMs={hold.ttlMs} />}

      <div className="tags">
        {[...seats]
          .sort((a, b) => a - b)
          .map((numero) => (
            <span className={`tag${paying ? ' tag--static' : ''}`} key={numero}>
              #{numero}
              {!paying && (
                <button
                  type="button"
                  className="tag__remove"
                  onClick={() => onRemoveSeat(numero)}
                  aria-label={`Quitar el asiento ${numero}`}
                  title={`Quitar el asiento ${numero}`}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
      </div>

      <PriceBreakdown quote={quote} loading={quoteLoading} />

      {/* ---- Antes de bloquear ---- */}
      {!paying && (
        <>
          {needsCompany && (
            <div className="field" style={{ marginTop: 16 }}>
              <label className="field__label" htmlFor="company">
                Razón social
              </label>
              <input
                id="company"
                className={`input${companyTouched && companyMissing ? ' input--invalid' : ''}`}
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                onBlur={() => setCompanyTouched(true)}
                placeholder="Viajes Nova S.A."
                autoComplete="organization"
                aria-describedby="company-hint"
              />
              <span className="field__hint" id="company-hint">
                Obligatoria desde {tripPricing?.descuentoCorporativoDesde ?? 5} asientos para
                aplicar el descuento corporativo.
              </span>
            </div>
          )}

          <div className="row-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn btn--primary btn--block"
              disabled={holding || companyMissing || !quote}
              onClick={() => onHold(company.trim() || undefined)}
            >
              {holding ? (
                <>
                  <span className="spin" aria-hidden="true">
                    ◌
                  </span>{' '}
                  Bloqueando…
                </>
              ) : (
                <>Bloquear y pagar</>
              )}
            </button>
            <button type="button" className="btn btn--block" disabled={holding} onClick={onClear}>
              Vaciar
            </button>
          </div>
        </>
      )}

      {/* ---- Pago ---- */}
      {paying && (
        <>
          <div className="divider">Pagar con</div>

          <PayPalCheckout
            clientId={gateway?.clientId ?? null}
            currency={quote?.cobro.moneda ?? 'USD'}
            disabled={capturing}
            createOrder={onCreateOrder}
            onApprove={onApprove}
            onCancel={onCancelPayment}
            onError={onPaymentError}
          />

          {capturing && (
            <div className="alert alert--ok" style={{ marginTop: 12 }}>
              <span className="alert__icon spin" aria-hidden="true">
                ◌
              </span>
              <div>Confirmando el pago y reservando tus asientos…</div>
            </div>
          )}

          {gateway?.pasarela.modo === 'sandbox' && !capturing && (
            <div className="panel__sub" style={{ marginTop: 12 }}>
              Modo de pruebas: inicia sesión con tu cuenta <strong>Personal</strong> de PayPal
              Sandbox. No se mueve dinero real.
            </div>
          )}

          <button
            type="button"
            className="btn btn--danger btn--block"
            style={{ marginTop: 12 }}
            disabled={capturing}
            onClick={onRelease}
          >
            Cancelar y liberar asientos
          </button>
        </>
      )}
    </section>
  );
}
