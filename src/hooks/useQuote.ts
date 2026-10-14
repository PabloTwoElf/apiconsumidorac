import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Quote } from '../types/api';

/**
 * Cotización de N asientos, calculada por el servidor.
 *
 * El frontend anterior replicaba la tabla de descuentos en el navegador, lo que
 * garantizaba que algún día mostrase un precio distinto al que se cobra. Aquí
 * la única fuente de verdad es `/calcular-precio`.
 *
 * Se aplica un pequeño retardo porque al seleccionar asientos rápido se
 * dispararían varias peticiones seguidas, y solo interesa la última.
 */
export function useQuote(cantidad: number) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (cantidad < 1) {
      setQuote(null);
      return;
    }

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      api
        .quote(cantidad, controller.signal)
        .then((result) => {
          setQuote(result);
          setLoading(false);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          // Si la cotización falla se conserva la anterior en pantalla: es
          // menos desconcertante que ver el total desaparecer.
          setLoading(false);
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [cantidad]);

  return { quote, loading };
}
