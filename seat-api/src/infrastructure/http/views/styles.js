/**
 * Hoja de estilos del panel (capa de vista).
 *
 * Glassmorphism: paneles translúcidos sobre un fondo con manchas de color
 * difuminadas. El efecto depende de tres cosas a la vez — fondo con color que
 * se transparente, `backdrop-filter: blur()` y un borde claro de 1px que
 * simule el canto del cristal. Quitar cualquiera de las tres y los paneles se
 * ven como tarjetas grises normales.
 *
 * Se entrega como cadena para que la vista sea autocontenida: en una función
 * serverless no se puede confiar en leer archivos estáticos del disco.
 */
export const styles = () => /* css */ `
:root {
  color-scheme: dark;
  --bg-base: #070b1a;
  --glass-bg: rgba(255, 255, 255, 0.07);
  --glass-bg-strong: rgba(255, 255, 255, 0.11);
  --glass-border: rgba(255, 255, 255, 0.16);
  --glass-border-strong: rgba(255, 255, 255, 0.28);
  --text: #f2f5ff;
  --text-muted: rgba(226, 232, 255, 0.64);
  --text-faint: rgba(226, 232, 255, 0.40);
  --accent: #7dd3fc;
  --accent-strong: #38bdf8;
  --violet: #a78bfa;
  --ok: #4ade80;
  --warn: #fbbf24;
  --danger: #fb7185;
  --radius: 20px;
  --radius-sm: 12px;
  --shadow: 0 8px 32px rgba(2, 6, 23, 0.44), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

/* Variante clara: el cristal necesita menos transparencia y sombras más suaves,
   porque sobre fondo claro un blanco al 7% desaparece. */
:root[data-theme="light"] {
  color-scheme: light;
  --bg-base: #eef2ff;
  --glass-bg: rgba(255, 255, 255, 0.58);
  --glass-bg-strong: rgba(255, 255, 255, 0.76);
  --glass-border: rgba(255, 255, 255, 0.9);
  --glass-border-strong: rgba(99, 102, 241, 0.28);
  --text: #111a3a;
  --text-muted: rgba(17, 26, 58, 0.68);
  --text-faint: rgba(17, 26, 58, 0.45);
  --accent: #0369a1;
  --accent-strong: #0284c7;
  --violet: #6d28d9;
  --ok: #15803d;
  --warn: #b45309;
  --danger: #be123c;
  --shadow: 0 8px 32px rgba(49, 46, 129, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  min-height: 100vh;
  padding: 0 16px 64px;
  background: var(--bg-base);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  line-height: 1.55;
  overflow-x: hidden;
}

/* Las manchas de color viven en un pseudo-elemento fijo: así el blur de los
   paneles tiene algo que difuminar al desplazar la página. */
body::before {
  content: "";
  position: fixed;
  inset: -20%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(42rem 42rem at 12% 8%, rgba(56, 189, 248, 0.32), transparent 60%),
    radial-gradient(38rem 38rem at 88% 12%, rgba(167, 139, 250, 0.30), transparent 62%),
    radial-gradient(34rem 34rem at 72% 88%, rgba(236, 72, 153, 0.22), transparent 62%),
    radial-gradient(30rem 30rem at 18% 82%, rgba(45, 212, 191, 0.24), transparent 60%);
  filter: blur(8px);
}

:root[data-theme="light"] body::before {
  background:
    radial-gradient(42rem 42rem at 12% 8%, rgba(56, 189, 248, 0.46), transparent 60%),
    radial-gradient(38rem 38rem at 88% 12%, rgba(167, 139, 250, 0.42), transparent 62%),
    radial-gradient(34rem 34rem at 72% 88%, rgba(244, 114, 182, 0.34), transparent 62%),
    radial-gradient(30rem 30rem at 18% 82%, rgba(45, 212, 191, 0.36), transparent 60%);
}

.wrap { max-width: 1180px; margin: 0 auto; }

/* ---------- Cristal ---------- */
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

/* ---------- Cabecera ---------- */
header.hero {
  margin: 32px 0 24px;
  padding: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
}

.hero-id { display: flex; align-items: center; gap: 16px; min-width: 0; }

.badge-logo {
  width: 54px; height: 54px; flex-shrink: 0;
  display: grid; place-items: center;
  font-size: 26px;
  border-radius: 16px;
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.38), rgba(167, 139, 250, 0.38));
  border: 1px solid var(--glass-border-strong);
}

.hero h1 {
  margin: 0;
  font-size: clamp(1.3rem, 3.4vw, 1.75rem);
  font-weight: 650;
  letter-spacing: -0.02em;
}

.hero p { margin: 2px 0 0; color: var(--text-muted); font-size: 0.86rem; }

.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }

/* ---------- Píldoras de estado ---------- */
.pill {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 13px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 560;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  white-space: nowrap;
}

.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex-shrink: 0; }
.dot.ok { background: var(--ok); box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.18); }
.dot.warn { background: var(--warn); box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.18); }
.dot.bad { background: var(--danger); box-shadow: 0 0 0 4px rgba(251, 113, 133, 0.18); }
.dot.live { animation: pulse 2s ease-in-out infinite; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* ---------- Rejilla y tarjetas ---------- */
.grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); margin-bottom: 18px; }
.cols { display: grid; gap: 18px; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); align-items: start; }

@media (max-width: 900px) { .cols { grid-template-columns: minmax(0, 1fr); } }

.card { padding: 20px; }
.card h2 { margin: 0 0 4px; font-size: 0.95rem; font-weight: 620; letter-spacing: -0.01em; }
.card h2 .ico { margin-right: 7px; opacity: 0.85; }
.card .sub { margin: 0 0 16px; font-size: 0.78rem; color: var(--text-faint); }

.metric { font-size: 1.85rem; font-weight: 640; letter-spacing: -0.03em; line-height: 1.1; }
.metric small { font-size: 0.8rem; font-weight: 500; color: var(--text-muted); letter-spacing: 0; }

/* ---------- Listas de datos ---------- */
dl.kv { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 7px 14px; font-size: 0.82rem; }
dl.kv dt { color: var(--text-faint); }
dl.kv dd {
  margin: 0; text-align: right; font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere; font-weight: 520;
}

code, .mono {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.78em;
}

code {
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  border-radius: 6px;
  padding: 1px 6px;
}

/* ---------- Botones ---------- */
button, .btn {
  font: inherit; font-size: 0.83rem; font-weight: 560;
  color: var(--text);
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 9px 16px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex; align-items: center; gap: 7px;
  transition: transform 0.14s ease, background 0.14s ease, border-color 0.14s ease;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

button:hover:not(:disabled), .btn:hover {
  background: var(--glass-bg);
  border-color: var(--glass-border-strong);
  transform: translateY(-1px);
}

button:disabled { opacity: 0.45; cursor: not-allowed; }

button:focus-visible, .btn:focus-visible, .seat:focus-visible, input:focus-visible {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}

button.primary {
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.34), rgba(167, 139, 250, 0.34));
  border-color: var(--glass-border-strong);
  font-weight: 600;
}

button.primary:hover:not(:disabled) {
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.46), rgba(167, 139, 250, 0.46));
}

/* ---------- Campos ---------- */
.field { display: flex; flex-direction: column; gap: 5px; }
.field label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-faint); font-weight: 580; }

input {
  font: inherit; font-size: 0.85rem;
  color: var(--text);
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: 9px 12px;
  width: 100%;
  min-width: 0;
}

input::placeholder { color: var(--text-faint); }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 18px; }
.controls .field { flex: 1 1 120px; }

/* ---------- Mapa de asientos ---------- */
.bus { margin-top: 4px; }

.bus-head {
  text-align: center;
  font-size: 0.74rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-faint);
  padding: 9px;
  border-radius: var(--radius-sm);
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  margin-bottom: 14px;
}

.row { display: flex; align-items: center; gap: 9px; justify-content: center; margin-bottom: 9px; }
.row-num { width: 18px; text-align: right; font-size: 0.68rem; color: var(--text-faint); flex-shrink: 0; }
.side { display: flex; gap: 8px; }
.aisle { width: 22px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.aisle span { width: 2px; height: 9px; border-radius: 2px; background: var(--text-faint); opacity: 0.5; }

.seat {
  width: 46px; height: 46px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1px;
  border-radius: 13px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-strong);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 0.8rem; font-weight: 600;
  color: var(--text);
  cursor: pointer;
  padding: 0;
  transition: transform 0.13s ease, background 0.13s ease, border-color 0.13s ease;
}

.seat .pos { font-size: 0.5rem; font-weight: 500; opacity: 0.6; letter-spacing: 0.02em; }
.seat:hover:not(:disabled) { transform: translateY(-2px) scale(1.04); border-color: var(--accent); }
.seat:disabled { cursor: not-allowed; }

.seat.sel {
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.52), rgba(167, 139, 250, 0.52));
  border-color: var(--accent);
  transform: scale(1.05);
}

.seat.en_hold { background: rgba(251, 191, 36, 0.22); border-color: rgba(251, 191, 36, 0.5); opacity: 0.75; }
.seat.miHold { background: rgba(74, 222, 128, 0.24); border-color: rgba(74, 222, 128, 0.55); }
.seat.ocupado { background: rgba(251, 113, 133, 0.2); border-color: rgba(251, 113, 133, 0.45); opacity: 0.6; }

.legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 16px; font-size: 0.74rem; color: var(--text-muted); }
.legend span.chip { display: inline-flex; align-items: center; gap: 6px; }
.swatch { width: 13px; height: 13px; border-radius: 4px; border: 1px solid var(--glass-border); flex-shrink: 0; }

.stats-bar {
  display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-around;
  margin-top: 16px; padding-top: 14px;
  border-top: 1px solid var(--glass-border);
  font-size: 0.78rem; color: var(--text-muted);
}

.stats-bar b { color: var(--text); font-variant-numeric: tabular-nums; }

/* ---------- Carrito ---------- */
.tags { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }

.tag {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px;
  border-radius: 9px;
  font-size: 0.76rem; font-weight: 560;
  background: linear-gradient(140deg, rgba(56, 189, 248, 0.26), rgba(167, 139, 250, 0.26));
  border: 1px solid var(--glass-border-strong);
}

.tag button { all: unset; cursor: pointer; opacity: 0.6; padding: 0 2px; line-height: 1; }
.tag button:hover { opacity: 1; }

.total-row {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--glass-border);
  font-weight: 650;
}

.total-row .amount { font-size: 1.2rem; letter-spacing: -0.02em; }
.save { color: var(--ok); font-size: 0.78rem; text-align: right; }

/* ---------- Avisos ---------- */
.note {
  padding: 11px 14px;
  border-radius: var(--radius-sm);
  font-size: 0.8rem;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg-strong);
  margin-bottom: 14px;
  overflow-wrap: anywhere;
}

.note.ok { border-color: rgba(74, 222, 128, 0.42); background: rgba(74, 222, 128, 0.12); }
.note.bad { border-color: rgba(251, 113, 133, 0.42); background: rgba(251, 113, 133, 0.12); }
.note.warn { border-color: rgba(251, 191, 36, 0.42); background: rgba(251, 191, 36, 0.12); }
.note:empty { display: none; }

/* ---------- Pasos del flujo ---------- */
ol.steps { margin: 0; padding-left: 0; list-style: none; counter-reset: step; }

ol.steps li {
  counter-increment: step;
  position: relative;
  padding: 0 0 14px 34px;
  font-size: 0.81rem;
  color: var(--text-muted);
  border-left: 1px dashed var(--glass-border);
  margin-left: 11px;
}

ol.steps li:last-child { border-left-color: transparent; padding-bottom: 0; }

ol.steps li::before {
  content: counter(step);
  position: absolute; left: -11px; top: 0;
  width: 22px; height: 22px;
  display: grid; place-items: center;
  border-radius: 50%;
  font-size: 0.68rem; font-weight: 640;
  color: var(--text);
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

ol.steps li.done::before { background: rgba(74, 222, 128, 0.32); border-color: var(--ok); content: "✓"; }
ol.steps li.active::before { background: linear-gradient(140deg, rgba(56, 189, 248, 0.5), rgba(167, 139, 250, 0.5)); border-color: var(--accent); }
ol.steps li.done, ol.steps li.active { color: var(--text); }

/* ---------- Endpoints ---------- */
.endpoints { display: grid; gap: 7px; }

.endpoint {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 11px;
  border-radius: 10px;
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border);
  font-size: 0.76rem;
}

.method {
  font-family: ui-monospace, monospace;
  font-size: 0.64rem; font-weight: 700;
  padding: 2px 7px; border-radius: 5px;
  flex-shrink: 0; min-width: 48px; text-align: center;
  background: var(--glass-bg); border: 1px solid var(--glass-border);
}

.method.get { color: var(--accent); }
.method.post { color: var(--ok); }
.method.delete { color: var(--danger); }
.endpoint .path { overflow-wrap: anywhere; font-family: ui-monospace, monospace; }

/* ---------- PayPal ---------- */
#paypal-buttons { margin-top: 14px; min-height: 48px; }
#paypal-buttons:empty::after { content: ""; }

/* ---------- Pie ---------- */
footer {
  margin-top: 26px; padding: 18px 22px;
  font-size: 0.76rem; color: var(--text-faint);
  display: flex; flex-wrap: wrap; gap: 12px; justify-content: space-between; align-items: center;
}

footer a { color: var(--accent); text-decoration: none; }
footer a:hover { text-decoration: underline; }

.spin { display: inline-block; animation: rot 0.9s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

/* Sin soporte de backdrop-filter (Firefox antiguo), se compensa con opacidad
   para que el texto no quede ilegible sobre las manchas de color. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass, .seat, .pill, .note, .endpoint { background: rgba(14, 20, 44, 0.88); }
  :root[data-theme="light"] .glass,
  :root[data-theme="light"] .seat,
  :root[data-theme="light"] .pill,
  :root[data-theme="light"] .note,
  :root[data-theme="light"] .endpoint { background: rgba(255, 255, 255, 0.94); }
}
`;
