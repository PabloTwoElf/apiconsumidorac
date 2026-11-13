import { Icon } from './Icon';
import { todayIso } from '../lib/format';

interface Props {
  rutaId: string;
  fecha: string;
  /** Precio por asiento escrito por el usuario (texto, vacío = precio del API). */
  precio: string;
  /** BASE_PRICE que informa el API, para mostrarlo como valor por defecto. */
  precioBase: number | null;
  moneda: string;
  refreshing: boolean;
  locked: boolean;
  onRutaChange: (value: string) => void;
  onFechaChange: (value: string) => void;
  onPrecioChange: (value: string) => void;
  onRefresh: () => void;
}

/**
 * Selector de ruta, fecha y precio del viaje.
 *
 * Mientras hay asientos bloqueados los campos se desactivan: cambiar de viaje
 * dejaría los bloqueos del viaje anterior fuera de la vista, sin forma de
 * liberarlos ni pagarlos.
 *
 * El precio por asiento existe porque el API cotiza por defecto con su
 * BASE_PRICE, pero la aplicación consumidora (CulturalTrip) tiene un precio
 * distinto por ruta. Este campo reproduce ese caso: lo que se escriba aquí
 * viaja en el hold y es lo que cobra PayPal.
 */
export function TripControls({
  rutaId,
  fecha,
  precio,
  precioBase,
  moneda,
  refreshing,
  locked,
  onRutaChange,
  onFechaChange,
  onPrecioChange,
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

      <div className="field">
        <label className="field__label" htmlFor="precio">
          Precio por asiento ({moneda})
        </label>
        <input
          id="precio"
          className="input"
          inputMode="decimal"
          placeholder={precioBase != null ? `${precioBase} (del API)` : 'Del API'}
          value={precio}
          disabled={locked}
          onChange={(event) => onPrecioChange(event.target.value.replace(/[^\d.,]/g, ''))}
          aria-describedby="precio-hint"
        />
        <span className="field__hint" id="precio-hint">
          Vacío = precio base del API. En CulturalTrip lo fija la ruta.
        </span>
      </div>

      <button
        type="button"
        className="btn"
        onClick={onRefresh}
        disabled={refreshing}
        title="Actualizar la disponibilidad"
      >
        <Icon name="refresh" size={16} spin={refreshing} />
        {refreshing ? 'Actualizando' : 'Actualizar'}
      </button>
    </div>
  );
}
