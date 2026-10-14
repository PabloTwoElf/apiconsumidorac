import { useState } from 'react';

const KEY = 'culturaltrip-user-id';

/**
 * Identidad del comprador en esta demostración.
 *
 * Se persiste para que al recargar la página el API siga reconociendo los
 * bloqueos como propios (`miHold`) y el usuario pueda liberarlos o pagarlos.
 * Sin esto, recargar dejaría los asientos bloqueados y fuera de su alcance
 * hasta que expirasen.
 *
 * En producción este identificador vendría de la sesión autenticada, no del
 * navegador: hoy cualquiera podría declararse otro usuario.
 */
export function useUserId(): string {
  const [userId] = useState(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored) return stored;
      const fresh = `web-${crypto.randomUUID().slice(0, 8)}`;
      localStorage.setItem(KEY, fresh);
      return fresh;
    } catch {
      // Modo privado o almacenamiento bloqueado: identificador solo en memoria.
      return `web-${Math.random().toString(36).slice(2, 10)}`;
    }
  });

  return userId;
}
