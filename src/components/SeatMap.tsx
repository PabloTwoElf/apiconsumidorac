import { useMemo } from 'react';
import { Icon } from './Icon';
import { SeatButton } from './SeatButton';
import type { Seat, SeatSummary } from '../types/api';

interface Props {
  seats: Seat[];
  seatsPerRow?: number;
  selected: Set<number>;
  summary: SeatSummary | null;
  loading: boolean;
  locked: boolean;
  onToggle: (numero: number) => void;
}

/** Agrupa los asientos en filas con lado izquierdo, pasillo y lado derecho. */
function toRows(seats: Seat[], perRow: number) {
  const rows: Array<{ row: number; left: Seat[]; right: Seat[] }> = [];
  const half = Math.ceil(perRow / 2);

  for (let i = 0; i < seats.length; i += perRow) {
    const slice = seats.slice(i, i + perRow);
    rows.push({
      row: i / perRow + 1,
      left: slice.slice(0, half),
      right: slice.slice(half),
    });
  }

  return rows;
}

/**
 * Carrocería del bus.
 *
 * El mapa no es una rejilla de botones: delimita el vehículo para que el
 * comprador se oriente como en el bus real. Parabrisas y cabina (volante y
 * puerta) delante, laterales marcados como ventana, número de fila, pasillo
 * con línea de guía y cola detrás. Todo sobre el mismo cristal que el resto de
 * paneles.
 */
function BusChassis({ children, aria }: { children: React.ReactNode; aria?: string }) {
  return (
    <div className="bus" role={aria ? 'group' : undefined} aria-label={aria}>
      <div className="bus__front" aria-hidden="true">
        <span className="bus__windshield">Frente</span>
      </div>

      <div className="bus__cabin" aria-hidden="true">
        <span className="bus__cabin-item bus__cabin-item--driver">
          <Icon name="wheel" size={18} /> Conductor
        </span>
        <span className="bus__cabin-item">
          <Icon name="door" size={16} /> Puerta
        </span>
      </div>

      <div className="bus__body">
        <div className="bus__rail" aria-hidden="true">
          <span>Ventana</span>
        </div>
        <div className="bus__rows">{children}</div>
        <div className="bus__rail bus__rail--right" aria-hidden="true">
          <span>Ventana</span>
        </div>
      </div>

      <div className="bus__back" aria-hidden="true">
        Parte trasera
      </div>
    </div>
  );
}

export function SeatMap({
  seats,
  seatsPerRow = 4,
  selected,
  summary,
  loading,
  locked,
  onToggle,
}: Props) {
  const rows = useMemo(() => toRows(seats, seatsPerRow), [seats, seatsPerRow]);

  if (loading) {
    return (
      <div aria-busy="true">
        <BusChassis>
          {Array.from({ length: 10 }, (_, r) => (
            <div className="row" key={r}>
              <span className="row__num" />
              <div className="row__side">
                <div className="skeleton skeleton--seat" />
                <div className="skeleton skeleton--seat" />
              </div>
              <div className="row__aisle" />
              <div className="row__side">
                <div className="skeleton skeleton--seat" />
                <div className="skeleton skeleton--seat" />
              </div>
            </div>
          ))}
        </BusChassis>
        <span className="sr-only">Cargando el mapa de asientos</span>
      </div>
    );
  }

  if (seats.length === 0) {
    return (
      <div className="empty">
        <span className="empty__icon" aria-hidden="true">
          <Icon name="bus" size={30} />
        </span>
        No hay asientos para este viaje. Comprueba la ruta y la fecha.
      </div>
    );
  }

  return (
    <div>
      <BusChassis aria="Mapa de asientos del bus">
        {rows.map(({ row, left, right }) => (
          <div className="row" key={row}>
            <span className="row__num" aria-hidden="true">
              {row}
            </span>

            <div className="row__side">
              {left.map((seat) => (
                <SeatButton
                  key={seat.numero}
                  seat={seat}
                  selected={selected.has(seat.numero)}
                  disabled={locked}
                  onToggle={onToggle}
                />
              ))}
            </div>

            <div className="row__aisle" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>

            <div className="row__side">
              {right.map((seat) => (
                <SeatButton
                  key={seat.numero}
                  seat={seat}
                  selected={selected.has(seat.numero)}
                  disabled={locked}
                  onToggle={onToggle}
                />
              ))}
            </div>
          </div>
        ))}
      </BusChassis>

      <div className="legend">
        <span className="legend__item">
          <span className="swatch swatch--free" /> Disponible
        </span>
        <span className="legend__item">
          <span className="swatch swatch--sel" /> Seleccionado
        </span>
        <span className="legend__item">
          <span className="swatch swatch--mine" /> Tu bloqueo
        </span>
        <span className="legend__item">
          <span className="swatch swatch--held" /> Bloqueado por otro
        </span>
        <span className="legend__item">
          <span className="swatch swatch--taken" /> Vendido
        </span>
      </div>

      {summary && (
        <div className="stats">
          <div className="stat">
            <div className="stat__value">{summary.disponibles}</div>
            <div className="stat__label">Libres</div>
          </div>
          <div className="stat">
            <div className="stat__value" style={{ color: 'var(--ok)' }}>
              {summary.miHold}
            </div>
            <div className="stat__label">Tuyos</div>
          </div>
          <div className="stat">
            <div className="stat__value" style={{ color: 'var(--warn)' }}>
              {summary.enHold}
            </div>
            <div className="stat__label">En espera</div>
          </div>
          <div className="stat">
            <div className="stat__value" style={{ color: 'var(--bad)' }}>
              {summary.ocupados}
            </div>
            <div className="stat__label">Vendidos</div>
          </div>
        </div>
      )}
    </div>
  );
}
