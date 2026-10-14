import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, releaseOnUnload } from '../lib/api';
import type { CaptureResult, HoldResult } from '../types/api';

/**
 * Fases del flujo de compra. Son excluyentes, y cada una habilita unas
 * acciones distintas en la interfaz.
 */
export type Phase = 'selecting' | 'holding' | 'held' | 'capturing' | 'done';

interface Options {
  rutaId: string;
  fecha: string;
  userId: string;
  onInfo: (kind: 'ok' | 'warn' | 'bad', title: string, text?: string) => void;
  onSeatsChanged: () => void;
}

/**
 * Orquesta el pago contra el Seat API.
 *
 * Mantiene la secuencia bloquear → crear orden → capturar, y se encarga de que
 * los asientos no queden atrapados: libera los bloqueos si el usuario cancela,
 * si el temporizador vence o si cierra la pestaña.
 *
 * La orden se crea dentro del callback `createOrder` de PayPal, no al bloquear,
 * para no dejar órdenes huérfanas de quien bloquea y nunca llega a pagar.
 */
export function useCheckout({ rutaId, fecha, userId, onInfo, onSeatsChanged }: Options) {
  const [phase, setPhase] = useState<Phase>('selecting');
  const [hold, setHold] = useState<HoldResult | null>(null);
  const [receipt, setReceipt] = useState<CaptureResult | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Espejo en ref para poder leerlo desde el listener de descarga de la página,
  // que no ve el estado de React.
  const holdRef = useRef<HoldResult | null>(null);
  holdRef.current = hold;

  /** Último recurso: al cerrar la pestaña se avisa al API para que libere. */
  useEffect(() => {
    const onUnload = () => {
      const current = holdRef.current;
      if (current) releaseOnUnload(current.holdIds, userId);
    };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [userId]);

  const reset = useCallback(() => {
    setPhase('selecting');
    setHold(null);
    setOrderId(null);
    setReceipt(null);
  }, []);

  /** Paso ①: bloquear los asientos elegidos. Todo-o-nada en el servidor. */
  const holdSeats = useCallback(
    async (asientos: number[], companyName?: string) => {
      if (asientos.length === 0) return;

      setPhase('holding');
      try {
        const result = await api.hold({ rutaId, fecha, asientos, userId, companyName });
        setHold(result);
        setPhase('held');
        onInfo(
          'ok',
          `${result.asientos.length} asiento(s) bloqueado(s)`,
          `Tienes ${Math.round(result.ttlMs / 60000)} minutos para completar el pago.`
        );
        onSeatsChanged();
      } catch (error) {
        const apiError = error as ApiError;
        setPhase('selecting');
        onInfo('bad', 'No se pudieron bloquear los asientos', apiError.message);
        // Si otro comprador se adelantó, el mapa en pantalla ya no es válido.
        if (apiError.isStale) onSeatsChanged();
      }
    },
    [rutaId, fecha, userId, onInfo, onSeatsChanged]
  );

  /** Paso ②: lo invoca PayPal al pulsar su botón. Devuelve el id de la orden. */
  const createOrder = useCallback(async () => {
    if (!hold) throw new Error('No hay asientos bloqueados.');

    const order = await api.createOrder({
      holdIds: hold.holdIds,
      userId,
      returnUrl: `${window.location.origin}${window.location.pathname}?pago=ok`,
      cancelUrl: `${window.location.origin}${window.location.pathname}?pago=cancelado`,
    });

    setOrderId(order.orderId);
    return order.orderId;
  }, [hold, userId]);

  /** Paso ③: cobrar y confirmar los asientos. */
  const capture = useCallback(
    async (id: string) => {
      setPhase('capturing');
      try {
        const result = await api.captureOrder({ orderId: id, userId });
        setReceipt(result);
        setPhase('done');
        setHold(null);

        if (result.requiereAtencion) {
          onInfo(
            'warn',
            'Pago cobrado con incidencias',
            `${result.conflictos.length} asiento(s) no se pudieron reservar. Guarda el comprobante ${result.captureId} para la devolución.`
          );
        } else {
          onInfo(
            'ok',
            '¡Pago confirmado!',
            `Asientos ${result.reservas.map((r) => r.asiento).join(', ')} reservados.`
          );
        }
        onSeatsChanged();
      } catch (error) {
        const apiError = error as ApiError;
        setPhase('held');
        onInfo('bad', 'No se pudo capturar el pago', apiError.message);
        onSeatsChanged();
      }
    },
    [userId, onInfo, onSeatsChanged]
  );

  /** Libera los bloqueos a petición del usuario. */
  const release = useCallback(
    async (reason?: string) => {
      if (!hold) return;
      try {
        await api.release({ holdIds: hold.holdIds, userId });
        onInfo('ok', 'Bloqueos liberados', reason ?? 'Los asientos vuelven a estar disponibles.');
      } catch {
        // Da igual que falle: los bloqueos expiran solos. No vale la pena
        // alarmar al usuario por algo que el servidor resuelve por su cuenta.
      } finally {
        reset();
        onSeatsChanged();
      }
    },
    [hold, userId, onInfo, onSeatsChanged, reset]
  );

  /** El temporizador llegó a cero: el servidor ya los habrá purgado. */
  const expire = useCallback(() => {
    if (!holdRef.current) return;
    onInfo('warn', 'Se agotó el tiempo', 'Los asientos volvieron a quedar disponibles.');
    reset();
    onSeatsChanged();
  }, [onInfo, onSeatsChanged, reset]);

  return {
    phase,
    hold,
    orderId,
    receipt,
    holdSeats,
    createOrder,
    capture,
    release,
    expire,
    reset,
  };
}
