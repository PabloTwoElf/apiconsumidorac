/**
 * Empaqueta y ejecuta scripts/render-check.tsx en Node.
 *
 * Hace falta un paso de empaquetado porque el componente está en TypeScript con
 * JSX y usa `import.meta.env` de Vite, nada de lo cual entiende Node tal cual.
 *
 * El `banner` define un `window` y un `document` mínimos: los hooks consultan
 * `matchMedia` y `localStorage` al calcular su estado inicial, que sí se
 * ejecuta durante el renderizado. No se usa jsdom a propósito, para no añadir
 * una dependencia de 2 MB por una comprobación.
 *
 * `navigator` no se define: en Node 20+ ya existe y es de solo lectura.
 */
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = path.resolve('node_modules/.cache');
const outFile = path.join(outDir, 'render-check.mjs');

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: ['scripts/render-check.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  jsx: 'automatic',
  outfile: outFile,
  logLevel: 'warning',
  // Las dependencias se dejan fuera del paquete: react-dom/server es
  // CommonJS y hace `require('stream')`, que al empaquetarlo a ESM se
  // convierte en un require dinámico que Node rechaza. Resolviéndolas
  // nativamente funcionan sin más.
  packages: 'external',
  // Vite sustituye estas variables al compilar; aquí hay que hacerlo a mano.
  define: {
    'import.meta.env': JSON.stringify({
      VITE_SEAT_API_URL: 'http://localhost:5008',
      MODE: 'test',
      DEV: false,
      PROD: true,
    }),
  },
  banner: {
    js: `
globalThis.window = globalThis.window ?? {
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  location: { origin: 'http://localhost:5173', pathname: '/' },
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = globalThis.document ?? {
  visibilityState: 'visible',
  documentElement: { dataset: {} },
  addEventListener() {}, removeEventListener() {},
};
`,
  },
});

await import(pathToFileURL(outFile).href);
