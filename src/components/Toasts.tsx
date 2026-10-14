import type { Toast } from '../hooks/useToasts';

const ICON = { ok: '✓', warn: '⚠', bad: '✕' } as const;

/**
 * Pila de avisos flotantes.
 *
 * `aria-live="polite"` para que un lector de pantalla los anuncie sin
 * interrumpir lo que el usuario esté haciendo.
 */
export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="region" aria-live="polite" aria-label="Notificaciones">
      {toasts.map((toast) => (
        <div className={`toast toast--${toast.kind}`} key={toast.id}>
          <span className="alert__icon" aria-hidden="true">
            {ICON[toast.kind]}
          </span>
          <div className="toast__body">
            <div className="toast__title">{toast.title}</div>
            {toast.text && <div className="toast__text">{toast.text}</div>}
          </div>
          <button
            type="button"
            className="toast__close"
            onClick={() => onDismiss(toast.id)}
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
