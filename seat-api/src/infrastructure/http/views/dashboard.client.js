/**
 * Script del panel (se sirve embebido en la vista).
 *
 * Consume la propia API con rutas relativas, así que funciona igual en
 * localhost y en Vercel sin configurar nada. Está escrito sin dependencias ni
 * build: lo que se escribe aquí es exactamente lo que ejecuta el navegador.
 */
export const clientScript = () => /* js */ `
(function () {
  'use strict';

  var CFG = window.__SEAT_API__ || {};
  var $ = function (id) { return document.getElementById(id); };

  // Estado del panel. 'selected' son asientos marcados pero aún no bloqueados;
  // 'holds' son los bloqueos ya confirmados por el servidor.
  var state = { seats: [], selected: [], holds: [], orderId: null, loading: false };

  // Los decimales los decide la moneda que informe el servidor: el dólar lleva
  // centavos y el peso colombiano no.
  var fmtCache = {};
  var money = function (v, currency) {
    var code = currency || 'USD';
    if (!fmtCache[code]) {
      fmtCache[code] = new Intl.NumberFormat('es-EC', { style: 'currency', currency: code });
    }
    return fmtCache[code].format(v || 0);
  };

  function note(el, text, kind) {
    var node = $(el);
    if (!node) return;
    node.textContent = text || '';
    node.className = 'note' + (kind ? ' ' + kind : '');
  }

  async function api(path, options) {
    var res = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' }
    }, options || {}));
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok || body.ok === false) {
      throw new Error(body.error || ('HTTP ' + res.status));
    }
    return body;
  }

  // ---------- Tema ----------
  (function theme() {
    var saved = null;
    try { saved = localStorage.getItem('seat-api-theme'); } catch (e) { /* modo privado */ }
    var prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    document.documentElement.dataset.theme = saved || (prefersLight ? 'light' : 'dark');

    $('btn-theme').addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('seat-api-theme', next); } catch (e) { /* ignorar */ }
    });
  })();

  // ---------- Diagnóstico del despliegue ----------
  async function loadDiagnostics() {
    try {
      var d = await api('/api/sistema/diagnostico');
      $('d-url').textContent = d.entorno.publicBaseUrl;
      $('d-node').textContent = d.entorno.nodeVersion;
      $('d-plat').textContent = d.entorno.plataforma;
      $('d-arq').textContent = 'hexagonal + MVC';
      $('d-cors').textContent = d.entorno.corsPermitidos.join(', ');

      $('pr-base').innerHTML = money(d.precios.precioUnitario, d.precios.moneda) +
        '<small> / asiento</small>';
      // Con la misma moneda y tasa 1 no hay conversión que explicar.
      $('pr-cur').textContent =
        d.precios.monedaCobro === d.precios.moneda && d.precios.tasaConversion === 1
          ? d.precios.monedaCobro + ' (sin conversión)'
          : d.precios.monedaCobro + ' (tasa ' + d.precios.tasaConversion + ')';

      $('inv-holds').innerHTML = d.asientos.holdsActivos + '<small> bloqueos activos</small>';
      $('inv-res').textContent = d.asientos.reservasConfirmadas;
      $('inv-ord').textContent = d.pagos.ordenes.total;
      $('inv-pag').textContent = d.pagos.ordenes.pagadas;
      $('inv-ttl').textContent = Math.round(d.asientos.holdTtlMs / 60000) + ' min';

      $('dot-deploy').className = 'dot ok';
      $('txt-deploy').textContent = 'Despliegue activo';
    } catch (err) {
      $('dot-deploy').className = 'dot bad';
      $('txt-deploy').textContent = 'Error: ' + err.message;
    }
  }

  // ---------- Verificación real de PayPal ----------
  async function loadPaypal() {
    try {
      var res = await fetch('/api/sistema/paypal');
      var d = await res.json();
      $('pp-state').innerHTML = d.conectado
        ? '<span style="color:var(--ok)">Conectado</span>'
        : '<span style="color:var(--danger)">Sin conexión</span>';
      $('pp-mode').textContent = d.modo || '—';
      $('pp-client').textContent = d.clientIdPrefijo || 'no configurado';
      $('pp-webhook').textContent = d.webhookConfigurado ? 'verificado' : 'sin verificar firma';
      $('pp-lat').textContent = d.latenciaMs != null ? d.latenciaMs + ' ms' : '—';
      if (!d.conectado) note('pay-msg', 'PayPal no responde: ' + (d.mensaje || ''), 'warn');
    } catch (err) {
      $('pp-state').innerHTML = '<span style="color:var(--danger)">Error</span>';
      $('pp-mode').textContent = err.message;
    }
  }

  // ---------- Pasos del flujo ----------
  function setStep(n) {
    var items = document.querySelectorAll('#steps li');
    for (var i = 0; i < items.length; i++) {
      var step = Number(items[i].dataset.step);
      items[i].className = step < n ? 'done' : (step === n ? 'active' : '');
    }
  }

  // ---------- Mapa de asientos ----------
  function renderMap() {
    var box = $('seat-map');
    box.innerHTML = '';

    var perRow = CFG.seatsPerRow || 4;
    var half = perRow / 2;
    var rows = Math.ceil(state.seats.length / perRow);

    for (var r = 0; r < rows; r++) {
      var row = document.createElement('div');
      row.className = 'row';

      var num = document.createElement('span');
      num.className = 'row-num';
      num.textContent = String(r + 1);
      row.appendChild(num);

      var left = document.createElement('div');
      left.className = 'side';
      var right = document.createElement('div');
      right.className = 'side';

      for (var c = 0; c < perRow; c++) {
        var seat = state.seats[r * perRow + c];
        if (!seat) continue;
        (c < half ? left : right).appendChild(seatButton(seat));
      }

      var aisle = document.createElement('div');
      aisle.className = 'aisle';
      aisle.innerHTML = '<span></span><span></span>';

      row.appendChild(left);
      row.appendChild(aisle);
      row.appendChild(right);
      box.appendChild(row);
    }
  }

  function seatButton(seat) {
    var btn = document.createElement('button');
    var isSelected = state.selected.indexOf(seat.numero) !== -1;
    var blocked = seat.estado === 'ocupado' || seat.estado === 'en_hold';

    btn.className = 'seat ' + (isSelected ? 'sel' : seat.estado);
    btn.disabled = blocked || state.loading;
    btn.title = 'Asiento ' + seat.numero + ' · ' + seat.posicion + ' · ' + seat.estado;
    btn.setAttribute('aria-pressed', String(isSelected));
    btn.innerHTML = '<span>' + seat.numero + '</span><span class="pos">' +
      (seat.posicion === 'Ventana' ? 'vent' : 'pas') + '</span>';

    btn.addEventListener('click', function () { toggleSeat(seat.numero); });
    return btn;
  }

  function toggleSeat(numero) {
    var i = state.selected.indexOf(numero);
    if (i !== -1) {
      state.selected.splice(i, 1);
    } else {
      if (state.selected.length >= (CFG.maxSeats || 10)) {
        note('map-msg', 'Máximo ' + CFG.maxSeats + ' asientos por reserva.', 'warn');
        return;
      }
      state.selected.push(numero);
      note('map-msg', '');
    }
    renderMap();
    renderCart();
  }

  async function loadMap() {
    state.loading = true;
    note('map-msg', 'Cargando asientos…');

    try {
      var q = new URLSearchParams({
        rutaId: $('f-ruta').value.trim(),
        fecha: $('f-fecha').value,
        userId: $('f-user').value.trim()
      });
      var d = await api('/api/asientos/view-model?' + q.toString());

      state.seats = d.asientos;
      // Se descartan las selecciones que ya no estén libres (otro comprador
      // pudo tomarlas entre dos cargas).
      state.selected = state.selected.filter(function (n) {
        var seat = d.asientos.filter(function (s) { return s.numero === n; })[0];
        return seat && seat.estado === 'disponible';
      });

      $('s-disp').textContent = d.resumen.disponibles;
      $('s-mio').textContent = d.resumen.miHold;
      $('s-hold').textContent = d.resumen.enHold;
      $('s-ocup').textContent = d.resumen.ocupados;

      note('map-msg', '');
      renderMap();
      renderCart();
    } catch (err) {
      note('map-msg', 'No se pudo cargar el mapa: ' + err.message, 'bad');
    } finally {
      state.loading = false;
    }
  }

  // ---------- Carrito ----------
  async function renderCart() {
    var qty = state.selected.length;
    var hasHolds = state.holds.length > 0;

    $('cart-empty').hidden = qty > 0 || hasHolds;
    $('cart-body').hidden = qty === 0 && !hasHolds;

    if (qty === 0 && !hasHolds) { setStep(1); return; }
    if (!hasHolds) setStep(2);

    var list = hasHolds ? state.holds.map(function (h) { return h.asiento; }) : state.selected.slice();
    list.sort(function (a, b) { return a - b; });

    var tags = $('cart-tags');
    tags.innerHTML = '';
    list.forEach(function (numero) {
      var tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '#' + numero;
      if (!hasHolds) {
        var x = document.createElement('button');
        x.textContent = '✕';
        x.setAttribute('aria-label', 'Quitar asiento ' + numero);
        x.addEventListener('click', function () { toggleSeat(numero); });
        tag.appendChild(x);
      }
      tags.appendChild(tag);
    });

    // El precio lo calcula el servidor: así el panel muestra exactamente lo que
    // se va a cobrar, sin duplicar la regla de descuentos en el navegador.
    try {
      var p = await api('/calcular-precio', {
        method: 'POST',
        body: JSON.stringify({ cantidad: list.length })
      });

      $('c-qty').textContent = p.cantidad;
      $('c-unit').textContent = money(p.precioUnitario, p.moneda);
      $('c-sub').textContent = money(p.subtotal, p.moneda);
      $('c-total').textContent = money(p.total, p.moneda);
      $('c-charge').textContent = 'Se cobra ' + p.cobro.valor + ' ' + p.cobro.moneda + ' en PayPal';

      var showDisc = p.porcentajeDescuento > 0;
      $('c-disc-label').hidden = !showDisc;
      $('c-disc').hidden = !showDisc;
      $('c-disc-label').textContent = 'Descuento (' + p.porcentajeDescuento + ' %)';
      $('c-disc').textContent = '−' + money(p.montoDescuento, p.moneda);
      $('c-save').textContent = p.ahorros || '';
      $('company-wrap').hidden = !p.requiereCompania || hasHolds;
    } catch (err) {
      note('pay-msg', 'No se pudo cotizar: ' + err.message, 'bad');
    }
  }

  // ---------- Bloquear asientos ----------
  async function holdSeats() {
    if (state.selected.length === 0) return;

    $('btn-hold').disabled = true;
    note('pay-msg', 'Bloqueando asientos…');

    try {
      var d = await api('/api/asientos/reservar', {
        method: 'POST',
        body: JSON.stringify({
          rutaId: $('f-ruta').value.trim(),
          fecha: $('f-fecha').value,
          asientos: state.selected,
          userId: $('f-user').value.trim(),
          companyName: $('f-company').value.trim() || undefined
        })
      });

      state.holds = d.holds;
      state.selected = [];
      note('pay-msg', d.holds.length + ' asiento(s) bloqueado(s) por ' +
        Math.round(d.ttlMs / 60000) + ' min. Creando la orden de pago…', 'ok');

      await loadMap();
      await createOrder();
    } catch (err) {
      note('pay-msg', 'No se pudo bloquear: ' + err.message, 'bad');
      await loadMap();
    } finally {
      $('btn-hold').disabled = false;
    }
  }

  // ---------- Crear la orden en PayPal ----------
  async function createOrder() {
    setStep(3);

    try {
      var d = await api('/api/checkout/crear-orden', {
        method: 'POST',
        body: JSON.stringify({
          holdIds: state.holds.map(function (h) { return h.holdId; }),
          userId: $('f-user').value.trim()
        })
      });

      state.orderId = d.orderId;
      $('o-id').textContent = d.orderId;
      $('pay-zone').hidden = false;
      note('pay-msg', 'Orden creada. Aprueba el pago con tu cuenta de sandbox.', 'ok');
      setStep(4);

      if (d.approvalUrl) {
        $('btn-approve').href = d.approvalUrl;
        $('btn-approve').hidden = false;
      }
      $('btn-capture').hidden = false;

      mountPaypalButtons();
      await loadDiagnostics();
    } catch (err) {
      note('pay-msg', 'No se pudo crear la orden: ' + err.message, 'bad');
    }
  }

  // ---------- Botones del SDK de PayPal ----------
  function loadPaypalSdk() {
    if (!CFG.paypalClientId) return Promise.reject(new Error('Sin PAYPAL_CLIENT_ID'));
    if (window.paypal) return Promise.resolve(window.paypal);

    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://www.paypal.com/sdk/js?client-id=' +
        encodeURIComponent(CFG.paypalClientId) +
        '&currency=' + encodeURIComponent(CFG.paymentCurrency || 'USD') +
        '&intent=capture&disable-funding=credit,card';
      s.onload = function () { resolve(window.paypal); };
      s.onerror = function () { reject(new Error('No se pudo cargar el SDK de PayPal')); };
      document.head.appendChild(s);
    });
  }

  function mountPaypalButtons() {
    var zone = $('paypal-buttons');
    zone.innerHTML = '';

    loadPaypalSdk().then(function (paypal) {
      paypal.Buttons({
        style: { layout: 'vertical', shape: 'pill', height: 42, label: 'pay' },
        // La orden ya existe en el servidor: aquí solo se le pasa su id, de modo
        // que el importe nunca se decide en el navegador.
        createOrder: function () { return state.orderId; },
        onApprove: function () { return captureOrder(); },
        onCancel: function () { note('pay-msg', 'Pago cancelado. Los bloqueos siguen activos hasta que expiren.', 'warn'); },
        onError: function (err) { note('pay-msg', 'Error del SDK de PayPal: ' + err, 'bad'); }
      }).render('#paypal-buttons').catch(function (err) {
        note('pay-msg', 'No se pudieron pintar los botones: ' + err.message +
          '. Usa el enlace "Aprobar en PayPal".', 'warn');
      });
    }).catch(function (err) {
      note('pay-msg', err.message + '. Usa el enlace "Aprobar en PayPal" y luego "capturar".', 'warn');
    });
  }

  // ---------- Capturar ----------
  async function captureOrder() {
    if (!state.orderId) return;

    setStep(5);
    note('pay-msg', 'Capturando el pago…');
    $('btn-capture').disabled = true;

    try {
      var d = await api('/api/checkout/capturar-orden', {
        method: 'POST',
        body: JSON.stringify({ orderId: state.orderId, userId: $('f-user').value.trim() })
      });

      var asientos = d.reservas.map(function (r) { return '#' + r.asiento; }).join(' ');
      if (d.requiereAtencion) {
        note('pay-msg', 'Pago capturado (' + d.captureId + ') pero ' + d.conflictos.length +
          ' asiento(s) no se pudieron reservar. Requiere devolución manual.', 'warn');
      } else {
        note('pay-msg', 'Pago capturado. Asientos reservados: ' + asientos +
          ' · captura ' + d.captureId, 'ok');
      }

      state.holds = [];
      state.orderId = null;
      $('pay-zone').hidden = true;
      $('btn-approve').hidden = true;
      $('btn-capture').hidden = true;

      await loadMap();
      await loadDiagnostics();
      setStep(1);
    } catch (err) {
      note('pay-msg', 'No se pudo capturar: ' + err.message, 'bad');
    } finally {
      $('btn-capture').disabled = false;
    }
  }

  // ---------- Liberar ----------
  async function releaseHolds() {
    if (state.holds.length === 0) return;

    try {
      await api('/api/asientos/holds', {
        method: 'DELETE',
        body: JSON.stringify({
          holdIds: state.holds.map(function (h) { return h.holdId; }),
          userId: $('f-user').value.trim()
        })
      });
      state.holds = [];
      state.orderId = null;
      $('pay-zone').hidden = true;
      note('pay-msg', 'Bloqueos liberados.', 'ok');
      await loadMap();
      await loadDiagnostics();
      setStep(1);
    } catch (err) {
      note('pay-msg', 'No se pudo liberar: ' + err.message, 'bad');
    }
  }

  // ---------- Arranque ----------
  function init() {
    // Fecha por defecto: una semana adelante, para no caer en fechas pasadas.
    var d = new Date(Date.now() + 7 * 864e5);
    $('f-fecha').value = d.toISOString().slice(0, 10);

    $('btn-load').addEventListener('click', loadMap);
    $('btn-hold').addEventListener('click', holdSeats);
    $('btn-clear').addEventListener('click', function () {
      state.selected = [];
      renderMap();
      renderCart();
    });
    $('btn-capture').addEventListener('click', captureOrder);
    $('btn-release').addEventListener('click', releaseHolds);

    // Si PayPal redirigió de vuelta con ?orden=..., se retoma la captura.
    var params = new URLSearchParams(location.search);
    if (params.get('orden') && params.get('estado') === 'aprobada') {
      state.orderId = params.get('orden');
      $('o-id').textContent = state.orderId;
      $('pay-zone').hidden = false;
      $('btn-capture').hidden = false;
      note('pay-msg', 'Volviste de PayPal. Pulsa "capturar" para confirmar los asientos.', 'warn');
      setStep(5);
    }

    loadDiagnostics();
    loadPaypal();
    loadMap();
    setStep(1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
