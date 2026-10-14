import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckoutPanel } from './components/CheckoutPanel';
import { SeatMap } from './components/SeatMap';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { TripControls } from './components/TripControls';
import { useCheckout } from './hooks/useCheckout';
import { useQuote } from './hooks/useQuote';
import { useSeatMap } from './hooks/useSeatMap';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import { useUserId } from './hooks/useUserId';
import { api } from './lib/api';
import { todayIso, tripDate } from './lib/format';
import type { GatewayConfig } from './types/api';

export default function App() {
  const { theme, toggle } = useTheme();
  const { toasts, push, dismiss } = useToasts();
  const userId = useUserId();

  const [rutaId, setRutaId] = useState('123');
  const [fecha, setFecha] = useState(() => todayIso(7));
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [gateway, setGateway] = useState<GatewayConfig | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  const { data, loading, refreshing, error, reload, refresh } = useSeatMap({
    rutaId,
    fecha,
    userId,
    onError: (err) => push('bad', 'No se pudo cargar el bus', err.message),
  });

  const checkout = useCheckout({
    rutaId,
    fecha,
    userId,
    onInfo: push,
    onSeatsChanged: refresh,
  });

  const { quote, loading: quoteLoading } = useQuote(
    checkout.hold ? checkout.hold.asientos.length : selected.size
  );

  // Estado de la conexión y configuración de la pasarela, una vez al arrancar.
  useEffect(() => {
    const controller = new AbortController();

    api
      .health(controller.signal)
      .then(() => setOnline(true))
      .catch(() => setOnline(false));

    api
      .gatewayConfig(controller.signal)
      .then(setGateway)
      .catch(() => {
        /* el panel de pago ya avisa si falta la configuración */
      });

    return () => controller.abort();
  }, []);

  // Al cambiar de viaje, la selección anterior deja de tener sentido.
  useEffect(() => {
    setSelected(new Set());
  }, [rutaId, fecha]);

  /**
   * Descarta las selecciones que ya no estén libres.
   *
   * Entre dos refrescos otro comprador puede haberse quedado con un asiento
   * que este usuario tenía marcado; dejarlo seleccionado solo serviría para que
   * el bloqueo falle después.
   */
  useEffect(() => {
    if (!data || checkout.phase !== 'selecting') return;

    setSelected((current) => {
      const free = new Set(
        data.asientos.filter((seat) => seat.estado === 'disponible').map((seat) => seat.numero)
      );
      const kept = [...current].filter((numero) => free.has(numero));

      if (kept.length === current.size) return current;

      const lost = current.size - kept.length;
      push(
        'warn',
        `${lost} asiento(s) ya no están libres`,
        'Otro comprador se adelantó. Se quitaron de tu selección.'
      );
      return new Set(kept);
    });
  }, [data, checkout.phase, push]);

  const maxSeats = data?.precios.maxAsientos ?? 10;

  const toggleSeat = useCallback(
    (numero: number) => {
      setSelected((current) => {
        const next = new Set(current);

        if (next.has(numero)) {
          next.delete(numero);
          return next;
        }

        if (next.size >= maxSeats) {
          push('warn', `Máximo ${maxSeats} asientos`, 'Quita alguno para elegir otro.');
          return current;
        }

        next.add(numero);
        return next;
      });
    },
    [maxSeats, push]
  );

  const removeSeat = useCallback((numero: number) => {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(numero);
      return next;
    });
  }, []);

  const handleHold = useCallback(
    (companyName?: string) => {
      void checkout.holdSeats([...selected], companyName);
      setSelected(new Set());
    },
    [checkout, selected]
  );

  const handleApprove = useCallback(
    async (orderId: string) => {
      await checkout.capture(orderId);
    },
    [checkout]
  );

  const seatsSelected = useMemo(() => [...selected], [selected]);
  const locked = checkout.phase !== 'selecting';

  return (
    <div className="app">
      <div className="aurora" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="shell">
        <TopBar gateway={gateway} online={online} theme={theme} onToggleTheme={toggle} />

        {online === false && (
          <div className="alert alert--bad" style={{ marginBottom: 18 }}>
            <span className="alert__icon" aria-hidden="true">
              ✕
            </span>
            <div>
              No hay respuesta del Seat API. Arráncala con{' '}
              <code>cd seat-api &amp;&amp; npm run dev</code> y reinicia este servidor para que el
              proxy la encuentre. Para ver qué puertos están en uso:{' '}
              <code>npm run puertos</code>.
            </div>
          </div>
        )}

        <div className="layout">
          <section className="glass panel" aria-label="Mapa de asientos">
            <div className="panel__head">
              <div>
                <h1 className="panel__title">
                  <span aria-hidden="true">🗺️</span> Elige tu asiento
                </h1>
                <p className="panel__sub">
                  Ruta {rutaId} · {tripDate(fecha)}
                  {data ? ` · ${data.resumen.disponibles} de ${data.totalAsientos} libres` : ''}
                </p>
              </div>
              {refreshing && (
                <span className="pill panel__aside">
                  <span className="pill__dot pill__dot--live" />
                  En vivo
                </span>
              )}
            </div>

            <div style={{ marginBottom: 20 }}>
              <TripControls
                rutaId={rutaId}
                fecha={fecha}
                refreshing={refreshing || loading}
                locked={locked}
                onRutaChange={setRutaId}
                onFechaChange={setFecha}
                onRefresh={reload}
              />
            </div>

            {locked && (
              <div className="alert alert--ok" style={{ marginBottom: 18 }}>
                <span className="alert__icon" aria-hidden="true">
                  🔒
                </span>
                <div>
                  Tienes asientos bloqueados para este viaje. Completa o cancela el pago para
                  cambiar de ruta o fecha.
                </div>
              </div>
            )}

            {error && !loading && (
              <div className="alert alert--bad" style={{ marginBottom: 18 }}>
                <span className="alert__icon" aria-hidden="true">
                  ✕
                </span>
                <div>
                  {error}
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: 10 }}
                    onClick={reload}
                  >
                    Reintentar
                  </button>
                </div>
              </div>
            )}

            <SeatMap
              seats={data?.asientos ?? []}
              seatsPerRow={4}
              selected={selected}
              summary={data?.resumen ?? null}
              loading={loading}
              locked={locked}
              onToggle={toggleSeat}
            />
          </section>

          <div className="rail">
            <CheckoutPanel
              phase={checkout.phase}
              selected={seatsSelected}
              hold={checkout.hold}
              receipt={checkout.receipt}
              quote={quote}
              quoteLoading={quoteLoading}
              tripPricing={data?.precios ?? null}
              gateway={gateway}
              fecha={fecha}
              onRemoveSeat={removeSeat}
              onClear={() => setSelected(new Set())}
              onHold={handleHold}
              onCreateOrder={checkout.createOrder}
              onApprove={handleApprove}
              onCancelPayment={() =>
                push('warn', 'Pago cancelado', 'Tus asientos siguen bloqueados hasta que expire el tiempo.')
              }
              onPaymentError={(message) => push('bad', 'Error de PayPal', message)}
              onRelease={() => void checkout.release()}
              onExpire={checkout.expire}
              onNew={checkout.reset}
            />
          </div>
        </div>
      </div>

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
