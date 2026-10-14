import { memo } from 'react';
import type { Seat } from '../types/api';

const CLASS_BY_STATE: Record<Seat['estado'], string> = {
  disponible: '',
  miHold: 'seat--mine',
  en_hold: 'seat--held',
  ocupado: 'seat--taken',
};

const LABEL_BY_STATE: Record<Seat['estado'], string> = {
  disponible: 'disponible',
  miHold: 'bloqueado por ti',
  en_hold: 'bloqueado por otro comprador',
  ocupado: 'ya vendido',
};

interface Props {
  seat: Seat;
  selected: boolean;
  disabled: boolean;
  onToggle: (numero: number) => void;
}

/**
 * Un asiento del bus.
 *
 * Es un `<button>` real y no un `<div>` con onClick: así se puede recorrer el
 * mapa con el teclado y un lector de pantalla anuncia su estado. `aria-pressed`
 * comunica la selección, que de otro modo solo existiría como color.
 *
 * Va memorizado porque el bus pinta 40 de estos y el sondeo refresca los datos
 * cada 12 segundos; sin memo, cada refresco repintaría los cuarenta.
 */
export const SeatButton = memo(function SeatButton({ seat, selected, disabled, onToggle }: Props) {
  const blocked = seat.estado === 'ocupado' || seat.estado === 'en_hold';
  const className = ['seat', selected ? 'seat--sel' : CLASS_BY_STATE[seat.estado]]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      disabled={blocked || disabled}
      aria-pressed={selected}
      aria-label={`Asiento ${seat.numero}, ${seat.posicion.toLowerCase()}, ${LABEL_BY_STATE[seat.estado]}`}
      title={`Asiento ${seat.numero} · ${seat.posicion} · ${LABEL_BY_STATE[seat.estado]}`}
      onClick={() => onToggle(seat.numero)}
    >
      <span className="seat__num">{seat.numero}</span>
      <span className="seat__pos" aria-hidden="true">
        {seat.posicion === 'Ventana' ? 'vent' : 'pas'}
      </span>
    </button>
  );
});
