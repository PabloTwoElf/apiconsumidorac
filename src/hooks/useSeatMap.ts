import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { ViewModel } from '../types/api';

const POLL_MS = 12_000;

interface Options {
  rutaId: string;
  fecha: string;
  userId: string;
  onError?: (error: ApiError) => void;
}

/**
 * Carga y mantiene al día el mapa de asientos.
 *
 * Sondea cada 12 segundos porque hay otros compradores actuando sobre el mismo
 * bus: sin refresco, el usuario seleccionaría un asiento que ya está tomado y
 * solo lo descubriría al intentar bloquearlo.
 *
 * El sondeo se detiene cuando la pestaña no está visible. Mantenerlo sería
 * gastar batería y peticiones para actualizar una vista que nadie mira.
 */
export function useSeatMap({ rutaId, fecha, userId, onError }: Options) {
  const [data, setData] = useState<ViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const load = useCallback(
    async (mode: 'full' | 'silent' = 'full') => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (mode === 'full') setLoading(true);
      else setRefreshing(true);

      try {
        const vm = await api.viewModel({ rutaId, fecha, userId }, controller.signal);
        setData(vm);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const apiError = err as ApiError;
        setError(apiError.message);
        // Un fallo del sondeo no molesta al usuario con un aviso: ya se
        // muestra el estado de error en la propia vista.
        if (mode === 'full') onErrorRef.current?.(apiError);
      } finally {
        if (mode === 'full') setLoading(false);
        else setRefreshing(false);
      }
    },
    [rutaId, fecha, userId]
  );

  useEffect(() => {
    void load('full');
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void load('silent');
    }, POLL_MS);

    // Al volver a la pestaña se refresca ya, porque lo que se ve puede llevar
    // minutos obsoleto.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load('silent');
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    reload: useCallback(() => load('full'), [load]),
    refresh: useCallback(() => load('silent'), [load]),
  };
}
