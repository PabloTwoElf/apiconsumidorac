import { useCallback, useRef, useState } from 'react';

export type ToastKind = 'ok' | 'warn' | 'bad';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  text?: string;
}

/**
 * Avisos flotantes.
 *
 * Se guardan los temporizadores para poder cancelarlos si el usuario cierra el
 * aviso antes: sin eso, el `setTimeout` seguiría vivo e intentaría eliminar un
 * elemento que ya no existe.
 */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, text?: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, kind, title, text }]);

      // Los errores no se van solos: suelen requerir una acción del usuario.
      if (kind !== 'bad') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), 5200)
        );
      }
      return id;
    },
    [dismiss]
  );

  return { toasts, push, dismiss };
}
