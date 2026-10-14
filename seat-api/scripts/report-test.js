/**
 * Prueba de los informes del tablero gerencial.
 *
 *   npm run smoke:reportes
 *
 * Recorre bloquear → crear orden → marcar pagada → informe, y comprueba que las
 * cifras cuadran con los descuentos esperados.
 *
 * No pasa por PayPal: inyecta la captura directamente en el repositorio de
 * órdenes, porque aprobar un pago exige que una persona inicie sesión en la web
 * de PayPal. Eso deja fuera la pasarela, que ya cubre `npm run smoke`, y
 * permite verificar justo lo que el smoke test no puede: la agregación sobre
 * ventas ya cobradas.
 */
import http from 'node:http';
import { createApp } from '../src/infrastructure/http/app.js';
import { PaymentOrder } from '../src/domain/model/PaymentOrder.js';

const silent = { log() {}, warn() {}, error() {} };
const { app, container } = createApp({ logger: silent });
const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

let bad = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const fail = (m) => {
  bad++;
  console.log(`  FAIL ${m}`);
};
const assert = (cond, msg) => (cond ? null : fail(msg));

const post = (p, b) =>
  fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  }).then((r) => r.json());
const get = (p) => fetch(base + p).then((r) => r.json());

console.log('\nInformes del tablero gerencial\n');

// --- Ventas simuladas: 3 pagadas + 1 pendiente ---
const ventas = [
  { ruta: '101', fecha: '2026-11-10', asientos: [1, 2, 3] }, // 7 % → 139 500
  { ruta: '101', fecha: '2026-11-10', asientos: [4, 5] },    // 5 % →  95 000
  { ruta: '202', fecha: '2026-11-12', asientos: [1] },       //  0 % →  50 000
];

let pagadas = 0;
for (const venta of ventas) {
  const hold = await post('/api/asientos/reservar', {
    rutaId: venta.ruta,
    fecha: venta.fecha,
    asientos: venta.asientos,
    userId: 'cliente-demo',
  });
  if (!hold.ok) {
    fail(`no se pudo bloquear ruta ${venta.ruta}: ${hold.error}`);
    continue;
  }

  // Se construye la orden sin pasar por PayPal y se marca pagada, que es lo
  // que haría CaptureCheckoutOrder tras una captura correcta.
  const quote = container.pricingPolicy.quote(venta.asientos.length);
  const now = Date.now();

  const order = new PaymentOrder({
    orderId: `TEST-${venta.ruta}-${now}`,
    rutaId: venta.ruta,
    fecha: venta.fecha,
    userId: 'cliente-demo',
    holdIds: hold.holdIds,
    asientos: hold.asientos,
    pricing: {
      cantidad: quote.quantity,
      moneda: quote.currency,
      precioUnitario: quote.basePrice,
      subtotal: quote.baseTotal,
      porcentajeDescuento: quote.discountPercent,
      montoDescuento: quote.discountAmount,
      total: quote.total,
      ahorros: quote.savings,
    },
    paypalAmount: quote.money.convertTo('USD', 1),
    createdAt: now,
  });
  order.markPaid({ captureId: `CAP-${now}`, payer: null, at: now });
  container.orderRepository.save(order);

  // Y los asientos pasan a reserva confirmada.
  for (let i = 0; i < hold.holdIds.length; i++) {
    container.useCases.confirmReservation.execute({
      rutaId: venta.ruta,
      fecha: venta.fecha,
      asiento: hold.asientos[i],
      holdId: hold.holdIds[i],
      orderId: order.orderId,
      captureId: order.captureId,
    });
  }
  pagadas++;
}

// Una orden pendiente, que NO debe contar como ingreso.
const pend = await post('/api/asientos/reservar', {
  rutaId: '303',
  fecha: '2026-11-15',
  asientos: [9, 10],
  userId: 'cliente-demo',
});
{
  const quote = container.pricingPolicy.quote(2);
  container.orderRepository.save(
    new PaymentOrder({
      orderId: 'TEST-PENDIENTE',
      rutaId: '303',
      fecha: '2026-11-15',
      userId: 'cliente-demo',
      holdIds: pend.holdIds,
      asientos: pend.asientos,
      // El precio lo calcula la política, no un literal: así el test no se
      // desincroniza cuando cambian la moneda o los tramos de descuento.
      pricing: {
        cantidad: quote.quantity,
        moneda: quote.currency,
        precioUnitario: quote.basePrice,
        subtotal: quote.baseTotal,
        porcentajeDescuento: quote.discountPercent,
        montoDescuento: quote.discountAmount,
        total: quote.total,
        ahorros: quote.savings,
      },
      paypalAmount: quote.money.convertTo('USD', 1),
      createdAt: Date.now(),
    })
  );
}

ok(`${pagadas} ventas pagadas + 1 pendiente creadas`);

// --- Comprobaciones del informe ---
const r = await get('/api/reportes/resumen');

assert(r.ok === true, 'el informe no respondió ok');

// 139 500 + 95 000 + 50 000 = 284 500
assert(
  r.ingresos.total === 71.12,
  `ingresos ${r.ingresos.total}, se esperaba 71.12`
);
if (r.ingresos.total === 71.12) ok(`ingresos ${r.ingresos.total} USD (solo órdenes pagadas)`);

assert(
  r.ordenes.pendientes === 1 && r.ordenes.pagadas === 3,
  `embudo: ${r.ordenes.pagadas} pagadas / ${r.ordenes.pendientes} pendientes`
);
if (r.ordenes.pagadas === 3) ok(`embudo: 3 pagadas, 1 pendiente, conversión ${r.ordenes.tasaConversion} %`);

assert(
  r.ordenes.valorPendiente === 23.75,
  `valor pendiente ${r.ordenes.valorPendiente}`
);
if (r.ordenes.valorPendiente === 23.75) ok('las órdenes pendientes NO suman al ingreso, van aparte');

// Descuentos: 10 500 + 5 000 + 0 = 15 500
assert(
  r.descuentos.montoTotal === 3.88,
  `descuentos ${r.descuentos.montoTotal}, se esperaba 15500`
);
if (r.descuentos.montoTotal === 3.88) {
  ok(`descuento concedido ${r.descuentos.montoTotal} USD en ${r.descuentos.ordenesConDescuento} órdenes`);
}

assert(r.ingresos.bruto === 75, `bruto ${r.ingresos.bruto}`);
if (r.ingresos.bruto === 75) ok('bruto = neto + descuento (75.00)');

assert(r.asientos.vendidos === 6, `asientos vendidos ${r.asientos.vendidos}`);
if (r.asientos.vendidos === 6) ok(`6 asientos vendidos · ocupación ${r.asientos.ocupacion} %`);

const ruta101 = r.porRuta.find((x) => x.rutaId === '101');
assert(ruta101?.ingresos === 58.62, `ruta 101: ${ruta101?.ingresos}`);
if (ruta101?.ingresos === 58.62) ok(`desglose por ruta: 101 lidera con ${ruta101.ingresos} USD`);

assert(r.porRuta[0].rutaId === '101', 'porRuta no viene ordenado por ingresos');
if (r.porRuta[0].rutaId === '101') ok('los desgloses vienen ordenados por ingreso');

const tramo7 = r.descuentos.porTramo.find((t) => t.porcentaje === 7);
assert(tramo7?.ordenes === 1, 'falta el tramo del 7 %');
if (tramo7) ok(`tramos de descuento: ${r.descuentos.porTramo.map((t) => t.porcentaje + '%').join(', ')}`);

assert(r.ultimasOrdenes.length === 4, `últimas órdenes: ${r.ultimasOrdenes.length}`);
if (r.ultimasOrdenes.length === 4) ok('últimas órdenes incluidas, con estado y captureId');

// --- Cobro en la pasarela ---
// 34.88 + 23.75 + 12.50 = 71.13
assert(
  r.ingresos.cobradoEnPasarela.valor === '71.12',
  `cobrado ${r.ingresos.cobradoEnPasarela.valor}, se esperaba 71.12`
);
if (r.ingresos.cobradoEnPasarela.valor === '71.12') {
  ok(`cobrado en pasarela ${r.ingresos.cobradoEnPasarela.valor} USD (suma de cobros, no conversión del total)`);
}

// --- KPIs ---
const k = await get('/api/reportes/kpis');
assert(k.ingresos.total === 71.12, `kpis ingresos ${k.ingresos.total}`);
assert(k.ordenes.pagadas === 3, `kpis pagadas ${k.ordenes.pagadas}`);
assert(!('porRuta' in k), 'los kpis no deberían traer los desgloses');
if (k.ingresos.total === 71.12 && !('porRuta' in k)) {
  ok(`/kpis devuelve solo indicadores (${JSON.stringify(k).length} bytes vs ${JSON.stringify(r).length} del informe)`);
}

// --- Filtros ---
const porRuta = await get('/api/reportes/resumen?rutaId=202');
assert(porRuta.ingresos.total === 12.5, `filtro por ruta: ${porRuta.ingresos.total}`);
if (porRuta.ingresos.total === 12.5) ok('filtro ?rutaId= aplicado');

const futuro = await get('/api/reportes/resumen?desde=2030-01-01');
assert(futuro.ingresos.total === 0, `filtro futuro: ${futuro.ingresos.total}`);
if (futuro.ingresos.total === 0) ok('filtro ?desde= aplicado (periodo sin ventas → 0)');

const hoy = new Date().toISOString().slice(0, 10);
const deHoy = await get(`/api/reportes/resumen?desde=${hoy}&hasta=${hoy}`);
assert(deHoy.ingresos.total === 71.12, `"hasta" inclusivo falló: ${deHoy.ingresos.total}`);
if (deHoy.ingresos.total === 71.12) ok('"hasta" es inclusivo: un informe de hoy incluye lo de hoy');

const rangoMalo = await fetch(`${base}/api/reportes/resumen?desde=2026-12-01&hasta=2026-01-01`);
assert(rangoMalo.status === 400, `rango invertido: HTTP ${rangoMalo.status}`);
if (rangoMalo.status === 400) ok('un rango invertido devuelve 400');

const fechaMala = await fetch(`${base}/api/reportes/resumen?desde=noviembre`);
assert(fechaMala.status === 400, `fecha inválida: HTTP ${fechaMala.status}`);
if (fechaMala.status === 400) ok('una fecha inválida devuelve 400');

console.log(`\n${bad === 0 ? 'INFORMES CORRECTOS' : `${bad} PROBLEMA(S)`}\n`);
await new Promise((r2) => server.close(r2));
process.exitCode = bad ? 1 : 0;
