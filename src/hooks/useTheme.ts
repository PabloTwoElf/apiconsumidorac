import { useCallback, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';
const KEY = 'culturaltrip-theme';

/** Lee la preferencia guardada; en modo privado el acceso puede lanzar. */
function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

/**
 * Tema claro/oscuro, persistido y respetando la preferencia del sistema
 * mientras el usuario no elija explícitamente.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = readStored();
    if (stored) return stored;
    return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* sin persistencia en modo privado: el tema sigue aplicándose */
    }
  }, [theme]);

  // Si el usuario cambia el tema del sistema y no ha elegido uno a mano, se sigue.
  useEffect(() => {
    if (readStored()) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event: MediaQueryListEvent) => setTheme(event.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return { theme, toggle };
}
