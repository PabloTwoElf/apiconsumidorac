import { styles } from './styles.js';
import { clientScript } from './dashboard.client.js';

const escape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Vista del panel de despliegue (la "V" del MVC).
 *
 * Cumple dos funciones a la vez:
 *  - Confirmar visualmente que el despliegue en Vercel quedó en pie: build,
 *    variables de entorno, CORS y credenciales de PayPal verificadas de verdad.
 *  - Ejercitar el flujo completo de compra contra la propia API, de modo que se
 *    puede demostrar la tesis sin abrir Postman ni el frontend.
 *
 * Se renderiza como cadena, sin plantillas ni archivos estáticos, para que
 * funcione igual en un servidor Node persistente y en una función serverless.
 */
export const renderDashboard = (config) => {
  const endpoints = [
    ['GET', '/health', 'Comprobación de salud'],
    ['GET', '/api/sistema/diagnostico', 'Estado completo del despliegue'],
    ['GET', '/api/sistema/paypal', 'Verifica credenciales contra PayPal'],
    ['GET', '/api/asientos/view-model', 'Mapa de asientos para la interfaz'],
    ['GET', '/api/asientos/disponibles', 'Mapa de asientos (contrato original)'],
    ['POST', '/api/asientos/reservar', 'Bloquear asientos (hold)'],
    ['GET', '/api/asientos/holds', 'Listar bloqueos activos'],
    ['DELETE', '/api/asientos/holds', 'Liberar bloqueos'],
    ['POST', '/api/asientos/reservar-definitivo', 'Confirmar sin pago en línea'],
    ['POST', '/calcular-precio', 'Cotizar precio con descuentos'],
    ['GET', '/api/checkout/configuracion', 'Datos públicos de la pasarela'],
    ['POST', '/api/checkout/crear-orden', 'Crear orden de pago en PayPal'],
    ['POST', '/api/checkout/capturar-orden', 'Capturar pago y reservar'],
    ['GET', '/api/checkout/orden/{orderId}', 'Consultar estado de una orden'],
    ['POST', '/api/checkout/webhook', 'Receptor de webhooks de PayPal'],
  ];

  // La configuración viaja al navegador como JSON para no repetirla en el script.
  const bootstrap = JSON.stringify({
    totalSeats: config.totalSeats,
    seatsPerRow: config.seatsPerRow,
    holdTtlMs: config.holdTtlMs,
    currency: config.currency,
    basePrice: config.basePrice,
    maxSeats: config.maxSeats,
    corporateFrom: config.corporateFrom,
    paymentCurrency: config.paymentCurrency,
    paypalMode: config.paypalMode,
    paypalClientId: config.paypalClientId || null,
  }).replace(/</g, '\\u003c');

  return /* html */ `<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CulturalTrip · Seat API</title>
<meta name="description" content="Panel de despliegue del API de asientos con pasarela PayPal Sandbox.">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="78" font-size="78">🚌</text></svg>'
  )}">
<style>${styles()}</style>
</head>
<body>
<div class="wrap">

  <header class="hero glass">
    <div class="hero-id">
      <div class="badge-logo" aria-hidden="true">🚌</div>
      <div>
        <h1>CulturalTrip · Seat API</h1>
        <p>
          Arquitectura hexagonal + MVC · Pasarela PayPal
          <strong>${escape(config.paypalMode)}</strong>
        </p>
      </div>
    </div>
    <div class="hero-actions">
      <span class="pill" id="pill-deploy"><span class="dot live" id="dot-deploy"></span><span id="txt-deploy">Comprobando…</span></span>
      <span class="pill"><span class="dot ${config.nodeEnv === 'production' ? 'ok' : 'warn'}"></span>${escape(config.nodeEnv)}</span>
      <span class="pill">${config.serverless ? '▲ Vercel Functions' : '⬢ Node.js'}</span>
      <a class="btn" href="/api-docs">📚 Swagger</a>
      <button id="btn-theme" title="Cambiar tema" aria-label="Cambiar entre tema claro y oscuro">🌗</button>
    </div>
  </header>

  <!-- Tarjetas de estado del despliegue -->
  <section class="grid" aria-label="Estado del despliegue">
    <article class="glass card">
      <h2><span class="ico">🩺</span>Despliegue</h2>
      <p class="sub">Lo que respondió el servidor en vivo</p>
      <dl class="kv">
        <dt>URL pública</dt><dd class="mono" id="d-url">—</dd>
        <dt>Node.js</dt><dd id="d-node">—</dd>
        <dt>Plataforma</dt><dd id="d-plat">—</dd>
        <dt>Arquitectura</dt><dd id="d-arq">—</dd>
        <dt>CORS</dt><dd id="d-cors">—</dd>
      </dl>
    </article>

    <article class="glass card">
      <h2><span class="ico">💳</span>PayPal Sandbox</h2>
      <p class="sub">Verificado pidiendo un token OAuth2 real</p>
      <div class="metric" id="pp-state"><span class="spin">◌</span></div>
      <dl class="kv" style="margin-top:12px">
        <dt>Modo</dt><dd id="pp-mode">—</dd>
        <dt>Client ID</dt><dd class="mono" id="pp-client">—</dd>
        <dt>Webhook</dt><dd id="pp-webhook">—</dd>
        <dt>Latencia</dt><dd id="pp-lat">—</dd>
      </dl>
    </article>

    <article class="glass card">
      <h2><span class="ico">💰</span>Precios y descuentos</h2>
      <p class="sub">Calculados por PricingPolicy en el dominio</p>
      <div class="metric" id="pr-base">—<small> / asiento</small></div>
      <dl class="kv" style="margin-top:12px">
        <dt>2 asientos</dt><dd>−5 %</dd>
        <dt>3 asientos</dt><dd>−7 %</dd>
        <dt>4 asientos</dt><dd>−10 %</dd>
        <dt>5 o más</dt><dd>−20 % · razón social</dd>
        <dt>Cobro en</dt><dd id="pr-cur">—</dd>
      </dl>
    </article>

    <article class="glass card">
      <h2><span class="ico">🎟️</span>Inventario en memoria</h2>
      <p class="sub">Estado actual del repositorio de asientos</p>
      <div class="metric" id="inv-holds">—<small> bloqueos activos</small></div>
      <dl class="kv" style="margin-top:12px">
        <dt>Reservas confirmadas</dt><dd id="inv-res">—</dd>
        <dt>Órdenes creadas</dt><dd id="inv-ord">—</dd>
        <dt>Órdenes pagadas</dt><dd id="inv-pag">—</dd>
        <dt>Duración del hold</dt><dd id="inv-ttl">—</dd>
      </dl>
    </article>
  </section>

  <!-- Demostración del flujo completo -->
  <div class="cols">
    <section class="glass card" aria-label="Mapa de asientos">
      <h2><span class="ico">🗺️</span>Mapa de asientos en vivo</h2>
      <p class="sub">Consume <code>GET /api/asientos/view-model</code> de esta misma API</p>

      <div class="controls">
        <div class="field">
          <label for="f-ruta">Ruta</label>
          <input id="f-ruta" value="123" inputmode="numeric">
        </div>
        <div class="field">
          <label for="f-fecha">Fecha</label>
          <input id="f-fecha" type="date">
        </div>
        <div class="field">
          <label for="f-user">Usuario</label>
          <input id="f-user" value="demo-panel">
        </div>
        <button id="btn-load" class="primary">🔄 Cargar</button>
      </div>

      <div class="note" id="map-msg" role="status" aria-live="polite"></div>

      <div class="bus">
        <div class="bus-head">Ventana · Pasillo ‖ Pasillo · Ventana</div>
        <div id="seat-map"></div>
      </div>

      <div class="legend">
        <span class="chip"><span class="swatch" style="background:var(--glass-bg-strong)"></span>Disponible</span>
        <span class="chip"><span class="swatch" style="background:linear-gradient(140deg,rgba(56,189,248,.52),rgba(167,139,250,.52))"></span>Seleccionado</span>
        <span class="chip"><span class="swatch" style="background:rgba(74,222,128,.24)"></span>Mi bloqueo</span>
        <span class="chip"><span class="swatch" style="background:rgba(251,191,36,.22)"></span>Bloqueado por otro</span>
        <span class="chip"><span class="swatch" style="background:rgba(251,113,133,.2)"></span>Ocupado</span>
      </div>

      <div class="stats-bar">
        <span>✅ <b id="s-disp">0</b> disponibles</span>
        <span>🟢 <b id="s-mio">0</b> míos</span>
        <span>🟡 <b id="s-hold">0</b> bloqueados</span>
        <span>🔴 <b id="s-ocup">0</b> ocupados</span>
      </div>
    </section>

    <div style="display:grid;gap:18px">
      <section class="glass card" aria-label="Carrito y pago">
        <h2><span class="ico">🛒</span>Carrito y pago</h2>
        <p class="sub">Flujo completo contra PayPal Sandbox</p>

        <ol class="steps" id="steps">
          <li data-step="1">Seleccionar asientos</li>
          <li data-step="2">Bloquear (<code>/reservar</code>)</li>
          <li data-step="3">Crear orden (<code>/crear-orden</code>)</li>
          <li data-step="4">Aprobar en PayPal</li>
          <li data-step="5">Capturar y reservar</li>
        </ol>

        <div id="cart-empty" class="sub" style="margin:16px 0 0">
          Selecciona asientos en el mapa para empezar.
        </div>

        <div id="cart-body" hidden>
          <div class="tags" id="cart-tags"></div>

          <dl class="kv">
            <dt>Cantidad</dt><dd id="c-qty">0</dd>
            <dt>Precio unitario</dt><dd id="c-unit">—</dd>
            <dt>Subtotal</dt><dd id="c-sub">—</dd>
            <dt id="c-disc-label" hidden>Descuento</dt><dd id="c-disc" hidden>—</dd>
          </dl>

          <div class="save" id="c-save"></div>

          <div class="total-row">
            <span>Total</span>
            <span class="amount" id="c-total">—</span>
          </div>
          <div class="sub" style="text-align:right;margin:4px 0 0" id="c-charge"></div>

          <div class="field" id="company-wrap" style="margin-top:14px" hidden>
            <label for="f-company">Razón social (obligatoria desde 5 asientos)</label>
            <input id="f-company" placeholder="Viajes Nova S.A.">
          </div>

          <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:16px">
            <button id="btn-hold" class="primary">🔒 Bloquear asientos</button>
            <button id="btn-clear">Limpiar</button>
          </div>
        </div>

        <div class="note" id="pay-msg" role="status" aria-live="polite" style="margin-top:14px"></div>

        <div id="pay-zone" hidden>
          <div class="total-row" style="border:0;padding:0;margin:14px 0 0">
            <span class="sub">Orden</span>
            <span class="mono" id="o-id">—</span>
          </div>
          <div id="paypal-buttons"></div>
          <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:10px">
            <a class="btn" id="btn-approve" href="#" target="_blank" rel="noopener" hidden>↗ Aprobar en PayPal</a>
            <button id="btn-capture" hidden>✅ Ya aprobé · capturar</button>
            <button id="btn-release">↩ Liberar bloqueos</button>
          </div>
        </div>
      </section>

      <section class="glass card" aria-label="Cuentas de prueba">
        <h2><span class="ico">🧪</span>Cómo probar el pago</h2>
        <p class="sub">Credenciales de comprador en PayPal Sandbox</p>
        <ol class="steps">
          <li>Bloquea asientos y crea la orden con el botón de PayPal.</li>
          <li>Inicia sesión con tu cuenta <strong>Personal</strong> de sandbox (la que termina en <code>@personal.example.com</code>).</li>
          <li>Aprueba el pago; el panel captura y confirma los asientos.</li>
          <li>Los asientos pasan a <strong>Ocupado</strong> y la orden a <code>paid</code>.</li>
        </ol>
        <p class="sub" style="margin:14px 0 0">
          Las cuentas de prueba se gestionan en
          <a href="https://developer.paypal.com/dashboard/accounts" target="_blank" rel="noopener" style="color:var(--accent)">developer.paypal.com</a>.
          Nunca uses credenciales reales en modo sandbox.
        </p>
      </section>
    </div>
  </div>

  <section class="glass card" style="margin-top:18px" aria-label="Endpoints disponibles">
    <h2><span class="ico">🔌</span>Endpoints publicados</h2>
    <p class="sub">Contrato completo en <a href="/api-docs" style="color:var(--accent)">/api-docs</a> · JSON en <a href="/api-docs.json" style="color:var(--accent)">/api-docs.json</a></p>
    <div class="endpoints">
      ${endpoints
        .map(
          ([method, path, desc]) => `<div class="endpoint">
        <span class="method ${method.toLowerCase()}">${method}</span>
        <span class="path">${escape(path)}</span>
        <span class="sub" style="margin:0 0 0 auto;text-align:right">${escape(desc)}</span>
      </div>`
        )
        .join('\n      ')}
    </div>
  </section>

  <footer class="glass">
    <span>CulturalTrip · Seat API v2.0.0 · hexagonal + MVC</span>
    <span><a href="/health">/health</a> · <a href="/api/sistema/diagnostico">/diagnostico</a> · <a href="/api-docs">/api-docs</a></span>
  </footer>

</div>

<script>window.__SEAT_API__ = ${bootstrap};</script>
<script>${clientScript()}</script>
</body>
</html>`;
};
