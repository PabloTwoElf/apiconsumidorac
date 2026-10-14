import type { Phase } from '../hooks/useCheckout';

const STEPS = [
  { label: 'Elegir asientos', phases: ['selecting'] },
  { label: 'Bloquear', phases: ['holding'] },
  { label: 'Pagar con PayPal', phases: ['held'] },
  { label: 'Confirmar reserva', phases: ['capturing', 'done'] },
] as const;

/** Índice del paso en curso según la fase, para marcar lo ya recorrido. */
function currentStep(phase: Phase): number {
  if (phase === 'done') return STEPS.length;
  return STEPS.findIndex((step) => (step.phases as readonly string[]).includes(phase));
}

/**
 * Indicador de progreso de la compra.
 *
 * El flujo sale del sitio (el comprador se va a PayPal y vuelve), así que
 * conviene que en todo momento vea en qué punto está y qué falta.
 */
export function Stepper({ phase }: { phase: Phase }) {
  const active = currentStep(phase);

  return (
    <ol className="stepper">
      {STEPS.map((step, index) => {
        const state = index < active ? 'done' : index === active ? 'active' : 'idle';

        return (
          <li
            key={step.label}
            className={`stepper__item${state !== 'idle' ? ` stepper__item--${state}` : ''}`}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            <span className="stepper__dot" aria-hidden="true">
              {state === 'done' ? '✓' : index + 1}
            </span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}
