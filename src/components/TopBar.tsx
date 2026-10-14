import { apiBaseUrl } from '../lib/api';
import type { GatewayConfig } from '../types/api';

interface Props {
  gateway: GatewayConfig | null;
  online: boolean | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

/**
 * Barra superior con el estado de la conexión.
 *
 * Las píldoras no son decorativas: cuando algo no funciona, la causa casi
 * siempre es que el API no está desplegada o que PayPal no tiene credenciales,
 * y verlo aquí ahorra abrir la consola del navegador.
 */
export function TopBar({ gateway, online, theme, onToggleTheme }: Props) {
  const base = apiBaseUrl();

  const apiPill =
    online === null
      ? { dot: '', text: 'Conectando…', live: true }
      : online
        ? { dot: 'pill__dot--ok', text: 'API conectada', live: false }
        : { dot: 'pill__dot--bad', text: 'API sin respuesta', live: false };

  const payPill = !gateway
    ? null
    : gateway.pasarela.configurado
      ? { dot: 'pill__dot--ok', text: `PayPal ${gateway.pasarela.modo}` }
      : { dot: 'pill__dot--warn', text: 'PayPal sin configurar' };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <div className="topbar__logo" aria-hidden="true">
          🚌
        </div>
        <div>
          <div className="topbar__name">CulturalTrip</div>
          <div className="topbar__tag">Selección de asientos</div>
        </div>
      </div>

      <div className="topbar__actions">
        <span className="pill" title={base || 'VITE_SEAT_API_URL sin configurar'}>
          <span className={`pill__dot ${apiPill.dot}${apiPill.live ? ' pill__dot--live' : ''}`} />
          {apiPill.text}
        </span>

        {payPill && (
          <span className="pill">
            <span className={`pill__dot ${payPill.dot}`} />
            {payPill.text}
          </span>
        )}

        {base && (
          <a className="btn" href={`${base}/api-docs`} target="_blank" rel="noopener noreferrer">
            <span aria-hidden="true">📚</span> API
          </a>
        )}

        <button
          type="button"
          className="btn btn--icon"
          onClick={onToggleTheme}
          aria-label={`Cambiar a tema ${theme === 'dark' ? 'claro' : 'oscuro'}`}
          title={`Cambiar a tema ${theme === 'dark' ? 'claro' : 'oscuro'}`}
        >
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '🌙'}</span>
        </button>
      </div>
    </header>
  );
}
