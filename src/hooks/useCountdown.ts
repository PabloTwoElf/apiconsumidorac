import { useEffect, useState } from 'react';

/**
 * Cuenta atrás hasta una marca de tiempo absoluta.
 *
 * Se apoya en `expiresAt` (un instante) y no en restar un segundo por tick:
 * si la pestaña queda en segundo plano el navegador frena los temporizadores,
 * y un contador incremental se desincronizaría del servidor justo cuando más
 * importa saber si el bloqueo sigue vivo.
 */
export function useCountdown(expiresAt: number | null, onExpire?: () => void) {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, expiresAt - Date.now()) : 0
  );

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }

    let fired = false;

    const tick = () => {
      const left = Math.max(0, expiresAt - Date.now());
      setRemaining(left);

      if (left === 0 && !fired) {
        fired = true;
        onExpire?.();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);

    // Al volver a la pestaña se recalcula de inmediato, sin esperar el tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // onExpire se omite a propósito: se quiere un temporizador por expiresAt,
    // no reiniciarlo cada vez que el padre recrea la función.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  return remaining;
}
