/**
 * Descubrimiento de puertos en localhost.
 *
 * Existe porque los puertos de desarrollo no son estables: Vite incrementa el
 * suyo cuando el que tiene configurado está ocupado (por eso el programa
 * principal pide el 3000 y acaba en el 3001), y tener que actualizar
 * `VITE_SEAT_API_URL`, `ALLOWED_ORIGINS` y `APP_RETURN_BASE_URL` cada vez es
 * una fuente constante de errores.
 *
 * En lugar de configurar el puerto, se pregunta quién responde.
 *
 * Lo usan dos sitios:
 *   - `vite.config.ts`, para apuntar el proxy de /api al API sin configurarla.
 *   - `npm run puertos`, para imprimir el mapa de servicios en marcha.
 */

/** Puertos donde puede estar cada servicio, en orden de preferencia. */
export const CANDIDATES = {
  seatApi: [5008, 5009, 5010, 4000, 8080],
  mainFrontend: [3000, 3001, 3002, 3003, 3004, 3005],
  mainBackend: [5000, 5001, 5002],
  demoFrontend: [5173, 5174, 5175, 5176],
};

const TIMEOUT_MS = 700;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    try {
      return { status: res.status, json: JSON.parse(text), text };
    } catch {
      return { status: res.status, json: null, text };
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Identifica qué servicio hay en un puerto.
 *
 * La comprobación no puede quedarse en "responde /health": el backend del
 * programa principal también responde ahí, y confundirlo con el Seat API
 * mandaría todas las peticiones al servicio equivocado. Se distingue por el
 * campo `servicio` del diagnóstico, que solo expone este API.
 */
export async function identify(port) {
  const base = `http://127.0.0.1:${port}`;

  const diag = await fetchJson(`${base}/api/sistema/diagnostico`);
  if (diag?.json?.servicio === 'seat-api') {
    return { port, base: `http://localhost:${port}`, kind: 'seat-api', detail: `v${diag.json.version}` };
  }

  const health = await fetchJson(`${base}/health`);
  if (health?.json?.name) {
    return { port, base: `http://localhost:${port}`, kind: 'otra-api', detail: health.json.name };
  }

  const root = await fetchJson(base);
  if (root?.text?.includes('/@vite/client')) {
    return { port, base: `http://localhost:${port}`, kind: 'vite', detail: 'servidor de desarrollo' };
  }
  if (root?.json?.name) {
    return { port, base: `http://localhost:${port}`, kind: 'otra-api', detail: root.json.name };
  }
  if (root) {
    return { port, base: `http://localhost:${port}`, kind: 'desconocido', detail: `HTTP ${root.status}` };
  }

  return null;
}

/**
 * Primer puerto de la lista donde responde el Seat API.
 * Se sondean en paralelo para no sumar los tiempos de espera, pero se devuelve
 * según el orden de preferencia y no según quién contesta antes.
 */
export async function findSeatApi(ports = CANDIDATES.seatApi) {
  const results = await Promise.all(ports.map((port) => identify(port)));
  return results.find((result) => result?.kind === 'seat-api') ?? null;
}

/** Mapa completo de lo que está escuchando, agrupado por rol. */
export async function scanAll() {
  const all = [
    ...new Set([
      ...CANDIDATES.seatApi,
      ...CANDIDATES.mainFrontend,
      ...CANDIDATES.mainBackend,
      ...CANDIDATES.demoFrontend,
    ]),
  ].sort((a, b) => a - b);

  const found = (await Promise.all(all.map((port) => identify(port)))).filter(Boolean);

  return {
    seatApi: found.find((s) => s.kind === 'seat-api') ?? null,
    viteApps: found.filter((s) => s.kind === 'vite'),
    otherApis: found.filter((s) => s.kind === 'otra-api'),
    unknown: found.filter((s) => s.kind === 'desconocido'),
    all: found,
  };
}
