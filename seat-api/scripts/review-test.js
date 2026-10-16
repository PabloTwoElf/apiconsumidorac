/**
 * Prueba del flujo de revisión manual: PayPal deja la captura en PENDING, el
 * administrador la aprueba (o rechaza) y el cliente ve su reserva confirmada.
 *
 *   node scripts/review-test.js
 *
 * La pasarela se sustituye por un doble: no hace falta un comprador real.
 */
import { createApp } from '../src/infrastructure/http/app.js';

const silent = { log() {}, warn() {}, error() {} };
const { app, container } = createApp({ logger: silent });

let n = 0;
Object.assign(container.paymentGateway, {
  createOrder: async () => ({ orderId: `TEST${++n}`, status: 'CREATED', success: true, estado: 'PENDIENTE_APROBACION', approvalUrl: 'https://example.test' }),
  captureOrder: async (orderId) => ({ captureId: `CAP-${orderId}`, status: 'PENDING', payer: { email_address: 'comprador@personal.example.com' } }),
});

const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
};

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const RUTA = '555';
const FECHA = '2026-12-24';
const buy = async (asientos, userId) => {
  const hold = await call('POST', '/api/asientos/reservar', { rutaId: RUTA, fecha: FECHA, asientos, userId });
  const order = await call('POST', '/api/checkout/crear-orden', { holdIds: hold.body.holdIds, userId });
  return order.body.orderId;
};
const seatState = async (asiento) => {
  const { body } = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}&userId=x`);
  const seats = body.asientos ?? body.seats ?? body.bus?.asientos ?? [];
  return seats.find((s) => (s.numero ?? s.asiento) === asiento)?.estado ?? JSON.stringify(Object.keys(body));
};

console.log('\nRevisión manual de pagos PENDING\n');

// --- Aprobar
const a = await buy([1, 2], 'cliente-a');
let r = await call('POST', '/api/checkout/capturar-orden', { orderId: a, userId: 'cliente-a' });
check('captura PENDING no falla: queda en revisión', r.status === 200 && r.body.enRevision === true, r.body.status);

let q = await call('GET', '/api/admin/pagos-pendientes');
check('la orden aparece en la cola del admin', q.body.pagos?.some((p) => p.orderId === a), `${q.body.total} en cola`);

r = await call('POST', '/api/checkout/capturar-orden', { orderId: a, userId: 'cliente-a' });
check('reintentar la captura sigue en revisión (no cobra dos veces)', r.body.enRevision === true);

r = await call('POST', `/api/admin/pagos/${a}/aprobar`);
check('el admin aprueba y se confirman los asientos', r.status === 200 && r.body.reservas?.length === 2, r.body.reservas?.map((x) => x.asiento).join(', '));

r = await call('POST', '/api/checkout/capturar-orden', { orderId: a, userId: 'cliente-a' });
check('el cliente recibe la reserva confirmada', r.body.status === 'paid' && r.body.reservas?.length === 2 && !r.body.enRevision);
check('el asiento 1 figura ocupado', /ocupad|reserv/i.test(await seatState(1)), await seatState(1));

q = await call('GET', '/api/admin/pagos-pendientes');
check('la cola queda vacía', q.body.total === 0);

// --- Rechazar
const b = await buy([3], 'cliente-b');
await call('POST', '/api/checkout/capturar-orden', { orderId: b, userId: 'cliente-b' });
r = await call('POST', `/api/admin/pagos/${b}/rechazar`, { motivo: 'prueba' });
check('el admin rechaza y libera el asiento', r.status === 200 && r.body.status === 'failed');
r = await call('POST', '/api/checkout/capturar-orden', { orderId: b, userId: 'cliente-b' });
check('el cliente recibe el rechazo', r.status === 409, r.body.error);
check('el asiento 3 vuelve a estar libre', /dispon|libre/i.test(await seatState(3)), await seatState(3));

r = await call('POST', `/api/admin/pagos/${a}/aprobar`);
check('aprobar una orden ya pagada da 409', r.status === 409);

await new Promise((resolve) => server.close(resolve));
console.log(failed ? `\n  ${failed} fallo(s)\n` : '\n  Todo correcto\n');
process.exitCode = failed ? 1 : 0;
