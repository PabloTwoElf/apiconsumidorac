import { money, tripDate } from '../lib/format';
import type { CaptureResult } from '../types/api';

interface Props {
  receipt: CaptureResult;
  fecha: string;
  onNew: () => void;
}

/**
 * Comprobante de la compra.
 *
 * El `captureId` se muestra de forma destacada porque es la referencia del
 * cobro en PayPal: es lo que el comprador necesitará si hay que reclamar, y
 * más aún cuando la compra terminó con incidencias.
 */
export function Receipt({ receipt, fecha, onNew }: Props) {
  const payerName = [receipt.payer?.name?.given_name, receipt.payer?.name?.surname]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="receipt">
      <div
        className="receipt__seal"
        style={
          receipt.requiereAtencion
            ? { background: 'rgba(251,191,36,.18)', borderColor: 'rgba(251,191,36,.45)' }
            : undefined
        }
        aria-hidden="true"
      >
        {receipt.requiereAtencion ? '⚠' : '✓'}
      </div>

      <div>
        <div className="receipt__title">
          {receipt.requiereAtencion ? 'Pago cobrado con incidencias' : '¡Reserva confirmada!'}
        </div>
        <div className="panel__sub">
          {receipt.reservas.length} asiento(s) para el {tripDate(fecha)}
        </div>
      </div>

      {receipt.requiereAtencion && (
        <div className="alert alert--warn" style={{ textAlign: 'left' }}>
          <span className="alert__icon" aria-hidden="true">
            ⚠
          </span>
          <div>
            {receipt.conflictos.length} asiento(s) no se pudieron reservar porque otro comprador se
            adelantó mientras pagabas. Conserva el comprobante: corresponde una devolución.
          </div>
        </div>
      )}

      <div className="tags" style={{ justifyContent: 'center', marginBottom: 0 }}>
        {receipt.reservas.map((reserva) => (
          <span className="tag tag--static" key={reserva.asiento}>
            #{reserva.asiento}
          </span>
        ))}
      </div>

      <dl className="receipt__meta">
        <div className="receipt__row">
          <dt>Comprobante</dt>
          <dd className="mono">{receipt.captureId}</dd>
        </div>
        <div className="receipt__row">
          <dt>Orden</dt>
          <dd className="mono">{receipt.orderId}</dd>
        </div>
        {payerName && (
          <div className="receipt__row">
            <dt>Pagador</dt>
            <dd>{payerName}</dd>
          </div>
        )}
        {receipt.payer?.email_address && (
          <div className="receipt__row">
            <dt>Correo</dt>
            <dd>{receipt.payer.email_address}</dd>
          </div>
        )}
        <div className="receipt__row">
          <dt>Total</dt>
          <dd>{money(receipt.pricing.total, receipt.pricing.moneda)}</dd>
        </div>
        <div className="receipt__row">
          <dt>Cobrado</dt>
          <dd>
            {receipt.cobro.valor} {receipt.cobro.moneda}
          </dd>
        </div>
      </dl>

      {/* Avisa cuando el asiento se honró pese a que el bloqueo había vencido:
          el comprador merece saber que el sistema lo resolvió a su favor. */}
      {receipt.reservas.some((r) => r.nota) && (
        <div className="panel__sub" style={{ textAlign: 'left' }}>
          Nota: algún bloqueo había expirado, pero el asiento seguía libre y se respetó tu pago.
        </div>
      )}

      <button type="button" className="btn btn--block" onClick={onNew}>
        Hacer otra reserva
      </button>
    </div>
  );
}
