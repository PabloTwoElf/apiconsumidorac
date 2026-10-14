import { createApp } from '../seat-api/src/infrastructure/http/app.js';

/**
 * Punto de entrada de Vercel para el proyecto de la raíz.
 *
 * Hace que un mismo dominio sirva las dos cosas:
 *   https://apiconsumidorac.vercel.app/          → frontend (build de Vite)
 *   https://apiconsumidorac.vercel.app/api/...   → Seat API (esta función)
 *
 * Existe porque el programa principal (CulturalTrip) ya apunta a
 * `https://apiconsumidorac.vercel.app/api/asientos` en su variable
 * VITE_SEAT_API_URL, y esa ruta devolvía 404: el dominio solo servía el
 * frontend. Alojando el API aquí, el programa principal funciona sin cambiar
 * su configuración, y al compartir origen desaparecen los problemas de CORS.
 *
 * El reparto de rutas está en el vercel.json de la raíz. No se llama a
 * listen(): en una función serverless no hay puerto que escuchar.
 *
 * Nota: la app se importa de `seat-api/src`, que sigue siendo la única copia
 * del código. `seat-api/` conserva su propio vercel.json para poder desplegarse
 * también como proyecto independiente.
 */
const { app } = createApp();

export default app;
