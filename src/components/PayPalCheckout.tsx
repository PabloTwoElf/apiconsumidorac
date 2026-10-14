import { useEffect, useRef, useState } from 'react';
import { loadPayPal } from '../lib/paypal';

interface Props {
  clientId: string | null;
  currency: string;
  disabled: boolean;
  createOrder: () => Promise<string>;
  onApprove: (orderId: string) => Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}

/**
 * Botones de pago de PayPal.
 *
 * La orden se crea en el servidor dentro de `createOrder`, y al navegador solo
 * se le entrega su identificador: el importe nunca se decide en el cliente.
 *
 * Montar un widget imperativo dentro de React tiene dos trampas que se cubren
 * aquí: en StrictMode el efecto corre dos veces (de ahí el cierre de la
 * instancia anterior al limpiar), y los callbacks capturan el valor que
 * tenían al montarse, por lo que se leen a través de refs y así siempre ven la
 * versión actual.
 */
export function PayPalCheckout({
  clientId,
  currency,
  disabled,
  createOrder,
  onApprove,
  onCancel,
  onError,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const handlers = useRef({ createOrder, onApprove, onCancel, onError });
  handlers.current = { createOrder, onApprove, onCancel, onError };

  useEffect(() => {
    if (!clientId) {
      setStatus('error');
      return;
    }

    let cancelled = false;
    let instance: { close: () => void } | null = null;

    loadPayPal(clientId, currency)
      .then((paypal) => {
        if (cancelled || !host.current) return;

        const buttons = paypal.Buttons({
          style: { layout: 'vertical', shape: 'pill', height: 46, label: 'paypal' },
          createOrder: () => handlers.current.createOrder(),
          onApprove: (data) => handlers.current.onApprove(data.orderID),
          onCancel: () => handlers.current.onCancel(),
          onError: (error) =>
            handlers.current.onError(
              error instanceof Error ? error.message : 'PayPal devolvió un error inesperado.'
            ),
        });

        instance = buttons;
        return buttons.render(host.current).then(() => {
          if (!cancelled) setStatus('ready');
        });
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setStatus('error');
        handlers.current.onError(error.message);
      });

    return () => {
      cancelled = true;
      // Sin este cierre, el doble montaje de StrictMode deja dos juegos de
      // botones apilados.
      try {
        instance?.close();
      } catch {
        /* la instancia ya pudo cerrarse sola */
      }
    };
  }, [clientId, currency]);

  if (!clientId) {
    return (
      <div className="alert alert--warn">
        <span className="alert__icon" aria-hidden="true">
          ⚠
        </span>
        <div>
          El API no tiene credenciales de PayPal configuradas. Añade{' '}
          <code>PAYPAL_CLIENT_ID</code> y <code>PAYPAL_CLIENT_SECRET</code> en las variables de
          entorno del despliegue.
        </div>
      </div>
    );
  }

  return (
    <>
      {status === 'error' && (
        <div className="alert alert--bad" style={{ marginBottom: 10 }}>
          <span className="alert__icon" aria-hidden="true">
            ✕
          </span>
          <div>No se pudieron cargar los botones de PayPal. Revisa tu conexión o un bloqueador.</div>
        </div>
      )}

      {/* El contenedor se mantiene siempre montado: el SDK necesita un nodo
          estable donde pintar, y desmontarlo mientras carga aborta el render. */}
      <div
        className={`paypal${status === 'loading' ? ' paypal--loading' : ''}`}
        ref={host}
        // Mientras se captura el pago se bloquean los clics para que no se
        // pueda lanzar una segunda captura.
        style={disabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
      >
        {status === 'loading' && (
          <span>
            <span className="spin" aria-hidden="true">
              ◌
            </span>{' '}
            Cargando PayPal…
          </span>
        )}
      </div>
    </>
  );
}
