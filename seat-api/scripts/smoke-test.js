/**
 * Prueba de humo del API completa.
 *
 * Levanta la aplicación en un puerto libre y recorre el flujo real:
 * diagnóstico → mapa de asientos → bloqueo → cotización → orden en PayPal
 * Sandbox → consulta de la orden → liberación.
 *
 * Verifica también las reglas que no deben romperse nunca: que el importe no se
 * pueda manipular desde el cliente, que un bloqueo ajeno no se pueda liberar y
 * que el bloqueo múltiple sea todo-o-nada.
 *
 *   npm run smoke
 *
 * Los pasos que llaman a PayPal se omiten solos si no hay credenciales.
 */
import { createApp } from '../src/infrastructure/http/app.js';

const silent = { log() {}, warn() {}, error() {} };
const { app, container } = createApp({ logger: silent });

const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});

const base = `http://127.0.0.1:${server.address().port}`;
const RUTA = '999';
const FECHA = '2026-12-24';
const USER = 'smoke-test';

let passed = 0;
let failed = 0;
let skipped = 0;

const call = async (method, path, body, headers = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body: json };
};

const check = async (name, fn) => {
  try {
    const detail = await fn();
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    failed++;
    console.log(`  ✗ ${name}\n      ${error.message}`);
  }
};

const skip = (name, why) => {
  skipped++;
  console.log(`  ⊘ ${name} — ${why}`);
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

console.log(`\nPrueba de humo · ${base}\n`);

// ---------------------------------------------------------------- Sistema
console.log('Sistema');

await check('GET /health responde ok', async () => {
  const { status, body } = await call('GET', '/health');
  assert(status === 200 && body.ok === true, `status ${status}`);
});

await check('GET / sirve el panel glassmorphism', async () => {
  const res = await fetch(base);
  const html = await res.text();
  assert(res.status === 200, `status ${res.status}`);
  assert(html.includes('backdrop-filter'), 'el CSS no incluye backdrop-filter');
  assert(html.includes('Seat API'), 'falta el título');
  return `${(html.length / 1024).toFixed(1)} KB de HTML`;
});

await check('GET /api/sistema/diagnostico no filtra el secret', async () => {
  const { status, body } = await call('GET', '/api/sistema/diagnostico');
  assert(status === 200, `status ${status}`);
  assert(body.arquitectura.includes('hexagonal'), 'falta la arquitectura');
  const dump = JSON.stringify(body);
  assert(!dump.includes(process.env.PAYPAL_CLIENT_SECRET || '@@nunca@@'), 'el client secret aparece en la respuesta');
  return body.arquitectura;
});

await check('GET /api-docs.json publica la especificación OpenAPI', async () => {
  const { status, body } = await call('GET', '/api-docs.json');
  assert(status === 200, `status ${status}`);
  const rutas = Object.keys(body.paths || {});
  assert(rutas.length >= 5, `solo ${rutas.length} rutas documentadas`);
  return `${rutas.length} rutas`;
});

await check('una ruta inexistente devuelve 404 en JSON', async () => {
  const { status, body } = await call('GET', '/no-existe');
  assert(status === 404 && body.ok === false, `status ${status}`);
});

// ---------------------------------------------------------------- Asientos
console.log('\nAsientos');

await check('GET /view-model devuelve el bus completo', async () => {
  const { status, body } = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}&userId=${USER}`);
  assert(status === 200, `status ${status}`);
  assert(body.asientos.length === 40, `${body.asientos.length} asientos`);
  assert(body.resumen.disponibles === 40, `${body.resumen.disponibles} disponibles`);
  return `${body.resumen.disponibles} disponibles de ${body.totalAsientos}`;
});

await check('GET /view-model sin parámetros devuelve 400', async () => {
  const { status, body } = await call('GET', '/api/asientos/view-model');
  assert(status === 400 && body.code === 'VALIDATION_ERROR', `status ${status}`);
});

await check('GET /disponibles mantiene el contrato original', async () => {
  const { status, body } = await call('GET', `/api/asientos/disponibles?rutaId=${RUTA}&fecha=${FECHA}`);
  assert(status === 200, `status ${status}`);
  assert(Array.isArray(body.available) && body.asientos[0].estado === 'available', 'formato inesperado');
});

await check('rechaza un asiento fuera del bus (41)', async () => {
  const { status } = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asiento: 41, userId: USER,
  });
  assert(status === 400, `status ${status}`);
});

await check('exige razón social desde 5 asientos', async () => {
  const { status, body } = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asientos: [30, 31, 32, 33, 34], userId: USER,
  });
  assert(status === 400, `status ${status}`);
  assert(body.error.includes('compañía'), body.error);
});

let holdIds = [];
let asientos = [];

await check('POST /reservar bloquea varios asientos y cotiza', async () => {
  const { status, body } = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asientos: [5, 6, 7], userId: USER,
  });
  assert(status === 201, `status ${status}: ${body.error}`);
  assert(body.holdIds.length === 3, `${body.holdIds.length} holds`);
  // 3 asientos → 7 % de descuento: 150 000 − 10 500 = 139 500
  assert(body.pricing.porcentajeDescuento === 7, `descuento ${body.pricing.porcentajeDescuento}`);
  assert(body.pricing.total === 34.87, `total ${body.pricing.total}`);
  holdIds = body.holdIds;
  asientos = body.asientos;
  return `asientos ${asientos.join(', ')} · total ${body.pricing.total} ${body.pricing.moneda}`;
});

await check('el bloqueo múltiple es todo-o-nada', async () => {
  // El 7 ya está bloqueado; el 8 y el 9 están libres y no deben quedar tomados.
  const { status } = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asientos: [8, 9, 7], userId: 'otro-usuario',
  });
  assert(status === 409, `status ${status}`);

  const { body } = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}`);
  const ocupados = [8, 9].filter(
    (n) => body.asientos.find((a) => a.numero === n).estado !== 'disponible'
  );
  assert(ocupados.length === 0, `quedaron bloqueados los asientos ${ocupados.join(', ')}`);
  return 'los asientos 8 y 9 siguieron libres tras el fallo';
});

await check('el view-model oculta el holdId a quien no es su dueño', async () => {
  const propio = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}&userId=${USER}`);
  const ajeno = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}&userId=intruso`);

  const mio = propio.body.asientos.find((a) => a.numero === 5);
  const otro = ajeno.body.asientos.find((a) => a.numero === 5);

  assert(mio.estado === 'miHold' && mio.holdId, 'el dueño no recibió su holdId');
  assert(otro.estado === 'en_hold' && otro.holdId === null, 'se filtró el holdId a un tercero');
  return 'miHold con id · en_hold sin id';
});

await check('no se puede liberar el bloqueo de otro usuario', async () => {
  const { status } = await call('DELETE', '/api/asientos/holds', {
    holdId: holdIds[0], userId: 'intruso',
  });
  assert(status === 400, `status ${status}`);
});

await check('POST /calcular-precio aplica el tramo del 20 %', async () => {
  const { status, body } = await call('POST', '/calcular-precio', { cantidad: 5 });
  assert(status === 200, `status ${status}`);
  assert(body.porcentajeDescuento === 20, `descuento ${body.porcentajeDescuento}`);
  assert(body.total === 50, `total ${body.total}`);
  return `5 asientos → ${body.total} ${body.moneda} = ${body.cobro.valor} ${body.cobro.moneda}`;
});

await check('rechaza más asientos del máximo permitido', async () => {
  const { status } = await call('POST', '/calcular-precio', { cantidad: 99 });
  assert(status === 400, `status ${status}`);
});

// ---------------------------------------------------------------- PayPal
console.log('\nCheckout PayPal');

const paypalReady = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

await check('GET /api/checkout/configuracion expone el modo', async () => {
  const { status, body } = await call('GET', '/api/checkout/configuracion');
  assert(status === 200, `status ${status}`);
  // El frontend necesita el clientId para cargar el SDK en el navegador; es
  // público por diseño, al contrario que el secret.
  if (paypalReady) assert(body.clientId, 'falta clientId para el SDK del navegador');
  assert(!JSON.stringify(body).includes(process.env.PAYPAL_CLIENT_SECRET || '@@nunca@@'),
    'el client secret viaja en /configuracion');
  return `modo ${body.pasarela.modo} · configurado: ${body.pasarela.configurado}`;
});

if (!paypalReady) {
  skip('autenticación con PayPal', 'sin PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
  skip('creación de la orden', 'sin credenciales');
} else {
  let paypalOk = false;

  await check('autenticación real con PayPal Sandbox', async () => {
    const inicio = Date.now();
    const { status, body } = await call('GET', '/api/sistema/paypal');
    assert(status === 200 && body.conectado, body.mensaje);
    paypalOk = true;
    return `token obtenido en ${Date.now() - inicio} ms`;
  });

  if (!paypalOk) {
    skip('creación de la orden', 'la autenticación falló');
  } else {
    let orderId = null;

    await check('POST /crear-orden crea la orden en PayPal', async () => {
      const { status, body } = await call('POST', '/api/checkout/crear-orden', {
        holdIds, userId: USER,
      });
      assert(status === 201, `status ${status}: ${body.error}`);
      assert(body.orderId, 'sin orderId');
      assert(body.approvalUrl, 'sin approvalUrl');
      // 3 asientos a 12.50 con 7 % de descuento = 34.87 USD, sin conversión
      assert(body.cobro.valor === '34.87', `cobro ${body.cobro.valor}`);
      assert(!('currency_code' in body.cobro), 'se filtraron nombres de campo de PayPal');
      orderId = body.orderId;
      return `${body.orderId} · ${body.cobro.valor} ${body.cobro.moneda}`;
    });

    await check('el importe se recalcula en el servidor', async () => {
      const { body } = await call('GET', `/api/checkout/orden/${orderId}`);
      assert(body.orden.pricing.total === 34.87, `total ${body.orden.pricing.total}`);
      return 'el cliente no puede fijar el precio: solo envía holdIds';
    });

    await check('GET /orden/:id consulta el estado en PayPal', async () => {
      const { status, body } = await call('GET', `/api/checkout/orden/${orderId}?paypal=true`);
      assert(status === 200, `status ${status}`);
      assert(body.orden.status === 'pending', `estado ${body.orden.status}`);
      assert(body.paypal?.status, `PayPal no devolvió estado: ${body.paypal?.error}`);
      return `nuestro estado: ${body.orden.status} · PayPal: ${body.paypal.status}`;
    });

    await check('capturar sin aprobación del comprador falla con 4xx/5xx', async () => {
      const { status } = await call('POST', '/api/checkout/capturar-orden', { orderId, userId: USER });
      // PayPal responde 422 ORDER_NOT_APPROVED; el adaptador lo traduce a 502.
      assert(status >= 400, `status ${status}`);
      return 'la captura exige aprobación previa, como debe ser';
    });

    await check('una orden inexistente devuelve 404', async () => {
      const { status } = await call('POST', '/api/checkout/capturar-orden', { orderId: 'NO-EXISTE-123' });
      assert(status === 404, `status ${status}`);
    });

    await check('el retorno vuelve al origen que creó la orden, sin configurar puertos', async () => {
      // Un puerto arbitrario: lo que se comprueba es que no hay ningún valor
      // fijo en configuración y que el destino se deduce de la petición.
      const origen = 'http://localhost:61234';

      const hold = await call(
        'POST', '/api/asientos/reservar',
        { rutaId: RUTA, fecha: FECHA, asientos: [25, 26], userId: USER },
        { Origin: origen }
      );
      assert(hold.status === 201, `bloqueo falló: ${hold.body.error}`);

      const orden = await call(
        'POST', '/api/checkout/crear-orden',
        { holdIds: hold.body.holdIds, userId: USER },
        { Origin: origen }
      );
      assert(orden.status === 201, `orden falló: ${orden.body.error}`);

      const res = await fetch(`${base}/checkout/retorno?token=${orden.body.orderId}&PayerID=P1`, {
        redirect: 'manual',
      });
      const location = res.headers.get('location') ?? '';
      assert(location.startsWith(origen), `redirigió a ${location || '(sin Location)'}`);

      await call('DELETE', '/api/asientos/holds', { holdIds: hold.body.holdIds, userId: USER });
      return location.replace(origen, '…');
    });
  }
}

// ---------------------------------------------------------------- Limpieza
console.log('\nLiberación');

await check('DELETE /holds libera los bloqueos', async () => {
  const { status, body } = await call('DELETE', '/api/asientos/holds', { holdIds, userId: USER });
  assert(status === 200 && body.count === holdIds.length, `liberados ${body.count}`);
  return `${body.count} bloqueo(s)`;
});

await check('liberar dos veces es idempotente', async () => {
  const { status, body } = await call('DELETE', '/api/asientos/holds', { holdIds, userId: USER });
  assert(status === 200 && body.released === false, `status ${status}`);
});

await check('POST /holds/liberar acepta holdIds por query (sendBeacon)', async () => {
  // El frontend usa esta ruta al cerrar la pestaña: navigator.sendBeacon solo
  // emite POST y no puede enviar un cuerpo JSON.
  const hold = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asientos: [11, 12], userId: USER,
  });
  assert(hold.status === 201, `bloqueo falló: ${hold.body.error}`);

  const ids = hold.body.holdIds.join(',');
  const { status, body } = await call(
    'POST',
    `/api/asientos/holds/liberar?holdIds=${encodeURIComponent(ids)}&userId=${USER}`
  );
  assert(status === 200 && body.count === 2, `liberados ${body.count}`);
  return 'lista separada por comas interpretada correctamente';
});

await check('el bus vuelve a estar completo', async () => {
  const { body } = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}`);
  assert(body.resumen.disponibles === 40, `${body.resumen.disponibles} disponibles`);
  return '40 asientos disponibles';
});

// ---------------------------------------------------------------- Dominio
console.log('\nReserva sin pago (taquilla)');

await check('un hold se convierte en reserva confirmada', async () => {
  const hold = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asiento: 20, userId: USER,
  });
  assert(hold.status === 201, `bloqueo falló: ${hold.body.error}`);

  const confirm = await call('POST', '/api/asientos/reservar-definitivo', {
    rutaId: RUTA, fecha: FECHA, asiento: 20, holdId: hold.body.holdId,
  });
  assert(confirm.status === 200, `confirmación falló: ${confirm.body.error}`);

  const { body } = await call('GET', `/api/asientos/view-model?rutaId=${RUTA}&fecha=${FECHA}`);
  const asiento20 = body.asientos.find((a) => a.numero === 20);
  assert(asiento20.estado === 'ocupado', `estado ${asiento20.estado}`);
  return 'el asiento 20 quedó ocupado';
});

await check('un holdId incorrecto no confirma la reserva', async () => {
  const hold = await call('POST', '/api/asientos/reservar', {
    rutaId: RUTA, fecha: FECHA, asiento: 21, userId: USER,
  });
  const { status } = await call('POST', '/api/asientos/reservar-definitivo', {
    rutaId: RUTA, fecha: FECHA, asiento: 21, holdId: 'hold_falso',
  });
  assert(status === 409, `status ${status}`);
  await call('DELETE', '/api/asientos/holds', { holdId: hold.body.holdId });
});

// ---------------------------------------------------------------- Resumen
const total = passed + failed;
console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${passed}/${total} comprobaciones superadas${skipped > 0 ? ` · ${skipped} omitida(s)` : ''}`);
console.log(`${'─'.repeat(52)}\n`);

container.seatRepository.reset();
container.orderRepository.reset();
server.close();

process.exit(failed > 0 ? 1 : 0);
