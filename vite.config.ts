import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { findSeatApi } from './scripts/ports.mjs';

/**
 * Configuración de Vite.
 *
 * El punto importante es el proxy: en desarrollo, `/api` se reenvía al Seat API
 * esté en el puerto que esté, descubriéndolo al arrancar. Así el navegador
 * siempre usa rutas relativas y el frontend no necesita saber ningún puerto.
 *
 * Además eso hace que desarrollo y producción se comporten igual: en Vercel
 * `/api` ya lo sirve la función de `api/index.js` en el mismo dominio. Sin el
 * proxy habría que mantener `VITE_SEAT_API_URL` apuntando a un puerto que
 * cambia, y encima lidiar con CORS solo en desarrollo.
 */
export default defineConfig(async () => {
  const seatApi = await findSeatApi();

  if (seatApi) {
    console.log(`\n  ✓ Seat API detectada en ${seatApi.base} (${seatApi.detail})\n`);
  } else {
    console.log(
      '\n  ⚠ No se encontró el Seat API. Arráncala con "cd seat-api && npm run dev".' +
        '\n    El proxy seguirá apuntando al puerto por defecto (5008).\n'
    );
  }

  const target = seatApi?.base ?? 'http://localhost:5008';

  // Las rutas que atiende el API. Coinciden con las reescrituras del
  // vercel.json de la raíz, para que el reparto sea idéntico en los dos lados.
  const apiPaths = ['/api', '/api-docs', '/health', '/calcular-precio', '/checkout'];

  return {
    plugins: [react()],
    server: {
      proxy: Object.fromEntries(
        apiPaths.map((path) => [path, { target, changeOrigin: true, secure: false }])
      ),
    },
  };
});
