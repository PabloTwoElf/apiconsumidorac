/**
 * Imprime qué servicios del proyecto están escuchando y en qué puerto.
 *
 *   npm run puertos
 *
 * Responde a la pregunta "¿en qué puerto quedó esta vez?" sin abrir el
 * administrador de tareas ni adivinar.
 */
import { scanAll } from './ports.mjs';

const { seatApi, viteApps, otherApis, unknown, all } = await scanAll();

const line = '─'.repeat(58);
console.log(`\n${line}\n  Servicios en marcha en localhost\n${line}\n`);

if (all.length === 0) {
  console.log('  Nada escuchando en los puertos habituales.\n');
  console.log('  Arranca el API:       cd seat-api && npm run dev');
  console.log('  Arranca el frontend:  npm run dev\n');
  process.exit(0);
}

const row = (label, service, extra = '') =>
  console.log(`  ${label.padEnd(22)} ${service.base.padEnd(26)} ${extra || service.detail}`);

if (seatApi) {
  row('Seat API', seatApi, `${seatApi.detail} · panel y /api-docs`);
} else {
  console.log(`  ${'Seat API'.padEnd(22)} ${'(no responde)'.padEnd(26)} cd seat-api && npm run dev`);
}

for (const app of viteApps) row('App web (Vite)', app);
for (const api of otherApis) row('Otra API', api);
for (const svc of unknown) row('Sin identificar', svc);

if (seatApi) {
  console.log(`\n${line}\n  Para configurar\n${line}\n`);
  console.log(`  Seat API            ${seatApi.base}`);
  console.log(`  Documentación       ${seatApi.base}/api-docs`);
  console.log(`  Panel              ${seatApi.base}/`);

  if (viteApps.length > 0) {
    console.log('\n  No hace falta tocar ALLOWED_ORIGINS: en desarrollo el API');
    console.log('  acepta cualquier puerto de localhost automáticamente.');
    console.log('\n  Y el frontend de este repositorio tampoco necesita');
    console.log('  VITE_SEAT_API_URL: su proxy encuentra el API al arrancar.');
  }
}

console.log('');
