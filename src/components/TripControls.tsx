import { todayIso } from '../lib/format';

interface Props {
  rutaId: string;
  fecha: string;
  refreshing: boolean;
  locked: boolean;
  onRutaChange: (value: string) => void;
  onFechaChange: (value: string) => void;
  onRefresh: () => void;
}

/**
 * Selector de ruta y fecha.
 *
 * Mientras hay asientos bloqueados los campos se desactivan: cambiar de viaje
 * dejaría los bloqueos del viaje anterior fuera de la vista, sin forma de
 * liberarlos ni pagarlos.
 */
export function TripControls({
  rutaId,
  fecha,
  refreshing,
  locked,
  onRutaChange,
  onFechaChange,
  onRefresh,
}: Props) {
  return (
    <div className="trip">
      <div className="field">
        <label className="field__label" htmlFor="ruta">
          Ruta
        </label>
        <input
          id="ruta"
          className="input"
          value={rutaId}
          inputMode="numeric"
          disabled={locked}
          onChange={(event) => onRutaChange(event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="fecha">
          Fecha de viaje
        </label>
        <input
          id="fecha"
          className="input"
          type="date"
          value={fecha}
          min={todayIso()}
          disabled={locked}
          onChange={(event) => onFechaChange(event.target.value)}
        />
      </div>

      <button
        type="button"
        className="btn"
        onClick={onRefresh}
        disabled={refreshing}
        title="Actualizar la disponibilidad"
      >
        <span className={refreshing ? 'spin' : undefined} aria-hidden="true">
          ⟳
        </span>
        {refreshing ? 'Actualizando' : 'Actualizar'}
      </button>
    </div>
  );
}
