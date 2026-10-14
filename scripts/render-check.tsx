/**
 * Comprobación de renderizado.
 *
 * Monta el árbol completo de componentes con `renderToString` y falla si algo
 * lanza. Cubre el hueco que dejan las otras comprobaciones: TypeScript valida
 * los tipos y verify-contract valida el API, pero ninguno detecta un acceso a
 * una propiedad de `undefined` dentro de un componente.
 *
 *   npm run check:render
 *
 * No ejecuta efectos (renderToString no los corre), así que valida el primer
 * pintado: estados vacíos, cargando y la estructura general.
 */
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import App from '../src/App';
import { SeatMap } from '../src/components/SeatMap';
import { Receipt } from '../src/components/Receipt';
import { PriceBreakdown } from '../src/components/PriceBreakdown';
import { HoldTimer } from '../src/components/HoldTimer';
import { Stepper } from '../src/components/Stepper';
import type { CaptureResult, Quote, Seat } from '../src/types/api';

let failures = 0;

function check(name: string, render: () => string) {
  try {
    const html = render();
    if (!html || html.length < 10) throw new Error('salida vacía');
    console.log(`  ok   ${name} — ${(html.length / 1024).toFixed(1)} KB`);
  } catch (error) {
    failures++;
    console.log(`  FAIL ${name}\n       ${(error as Error).message}`);
  }
}

console.log('\nComprobación de renderizado\n');

check('App (estado inicial, cargando)', () => renderToString(createElement(App)));

// --- SeatMap en sus distintos estados ---
const seat = (numero: number, estado: Seat['estado']): Seat => ({
  numero,
  estado,
  posicion: numero % 4 === 1 || numero % 4 === 0 ? 'Ventana' : 'Pasillo',
  holdId: estado === 'miHold' ? `hold_${numero}` : null,
  expiresAt: estado === 'miHold' ? Date.now() + 60_000 : null,
  remainingMs: estado === 'miHold' ? 60_000 : null,
});

const seats: Seat[] = [
  ...Array.from({ length: 36 }, (_, i) => seat(i + 1, 'disponible')),
  seat(37, 'miHold'),
  seat(38, 'en_hold'),
  seat(39, 'ocupado'),
  seat(40, 'disponible'),
];

check('SeatMap (cargando)', () =>
  renderToString(
    createElement(SeatMap, {
      seats: [],
      selected: new Set<number>(),
      summary: null,
      loading: true,
      locked: false,
      onToggle: () => {},
    })
  )
);

check('SeatMap (vacío)', () =>
  renderToString(
    createElement(SeatMap, {
      seats: [],
      selected: new Set<number>(),
      summary: null,
      loading: false,
      locked: false,
      onToggle: () => {},
    })
  )
);

check('SeatMap (los cuatro estados de asiento)', () => {
  const html = renderToString(
    createElement(SeatMap, {
      seats,
      selected: new Set([1, 2]),
      summary: { disponibles: 37, enHold: 1, miHold: 1, ocupados: 1 },
      loading: false,
      locked: false,
      onToggle: () => {},
    })
  );

  for (const cls of ['seat--sel', 'seat--mine', 'seat--held', 'seat--taken']) {
    if (!html.includes(cls)) throw new Error(`falta la clase ${cls}`);
  }
  // Se cuenta por aria-pressed, que solo llevan los botones de asiento: un
  // patrón sobre class="seat" también casaría con seat__num y seat__pos.
  const buttons = (html.match(/aria-pressed=/g) || []).length;
  if (buttons !== 40) throw new Error(`se pintaron ${buttons} asientos en lugar de 40`);
  return html;
});

// --- Precio ---
const quote: Quote = {
  cantidad: 3,
  moneda: 'COP',
  precioUnitario: 50000,
  subtotal: 150000,
  porcentajeDescuento: 7,
  montoDescuento: 10500,
  total: 139500,
  ahorros: 'Ahorras: $10.500',
  requiereCompania: false,
  cobro: { moneda: 'USD', valor: '34.88', tasaConversion: 4000 },
};

check('PriceBreakdown (con descuento)', () =>
  renderToString(createElement(PriceBreakdown, { quote, loading: false }))
);

check('PriceBreakdown (sin datos)', () =>
  renderToString(createElement(PriceBreakdown, { quote: null, loading: true }))
);

// --- Temporizador ---
check('HoldTimer (normal)', () =>
  renderToString(createElement(HoldTimer, { remainingMs: 540_000, totalMs: 600_000 }))
);

check('HoldTimer (urgente)', () => {
  const html = renderToString(createElement(HoldTimer, { remainingMs: 25_000, totalMs: 600_000 }));
  if (!html.includes('timer--urgent')) throw new Error('no aplicó el estado urgente');
  return html;
});

// --- Pasos ---
for (const phase of ['selecting', 'holding', 'held', 'capturing', 'done'] as const) {
  check(`Stepper (${phase})`, () => renderToString(createElement(Stepper, { phase })));
}

// --- Comprobante ---
const receipt: CaptureResult = {
  orderId: '5O190127TN364715T',
  status: 'paid',
  captureId: '3C679366HH908993F',
  yaProcesada: false,
  asientos: [5, 6],
  reservas: [
    { asiento: 5, estado: 'reservado', reservedAt: Date.now() },
    { asiento: 6, estado: 'reservado', reservedAt: Date.now(), nota: 'El bloqueo había expirado' },
  ],
  conflictos: [],
  requiereAtencion: false,
  pricing: {
    cantidad: 2,
    moneda: 'COP',
    precioUnitario: 50000,
    subtotal: 100000,
    porcentajeDescuento: 5,
    montoDescuento: 5000,
    total: 95000,
    ahorros: 'Ahorras: $5.000',
  },
  cobro: { moneda: 'USD', valor: '23.75', tasaConversion: 4000 },
  payer: { name: { given_name: 'Ana', surname: 'Pérez' }, email_address: 'ana@personal.example.com' },
};

check('Receipt (correcto)', () => {
  const html = renderToString(
    createElement(Receipt, { receipt, fecha: '2026-11-20', onNew: () => {} })
  );
  if (!html.includes(receipt.captureId)) throw new Error('no muestra el comprobante de captura');
  return html;
});

check('Receipt (con incidencias)', () => {
  const html = renderToString(
    createElement(Receipt, {
      receipt: {
        ...receipt,
        requiereAtencion: true,
        reservas: [receipt.reservas[0]],
        conflictos: [{ asiento: 6, estado: 'no_disponible', motivo: 'Otro comprador lo tomó' }],
      },
      fecha: '2026-11-20',
      onNew: () => {},
    })
  );
  if (!html.includes('devolución')) throw new Error('no avisa de la devolución pendiente');
  return html;
});

console.log(
  `\n${failures === 0 ? 'TODOS LOS COMPONENTES RENDERIZAN' : `${failures} COMPONENTE(S) CON FALLO`}\n`
);

process.exit(failures > 0 ? 1 : 0);
