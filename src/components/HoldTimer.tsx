import { clock } from '../lib/format';

interface Props {
  remainingMs: number;
  totalMs: number;
}

/**
 * Cuenta atrás del bloqueo.
 *
 * El comprador necesita saber que su reserva tiene fecha de caducidad, y
 * cuánto le queda: sin esta pieza, los asientos se liberarían "sin motivo"
 * mientras rellena el pago. Por debajo de un minuto el aviso se vuelve rojo.
 */
export function HoldTimer({ remainingMs, totalMs }: Props) {
  const ratio = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const urgent = remainingMs < 60_000;

  return (
    <div className={`timer${urgent ? ' timer--urgent' : ''}`}>
      <div className="timer__head">
        <span className="timer__label">{urgent ? '¡Se agota el tiempo!' : 'Tiempo para pagar'}</span>
        <span
          className="timer__clock"
          role="timer"
          // Solo se anuncia en el tramo crítico: cada segundo sería insufrible
          // con un lector de pantalla.
          aria-live={urgent ? 'assertive' : 'off'}
        >
          {clock(remainingMs)}
        </span>
      </div>
      <div
        className="timer__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label="Tiempo restante del bloqueo"
      >
        <div className="timer__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
