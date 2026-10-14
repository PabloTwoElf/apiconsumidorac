import { createApp } from '../src/infrastructure/http/app.js';

/**
 * Punto de entrada para Vercel Functions.
 *
 * Vercel trata cada archivo bajo /api como una función y espera que el módulo
 * EXPORTE un manejador (req, res). Aquí se exporta la aplicación Express tal
 * cual, que ya cumple esa firma, y deliberadamente NO se llama a listen():
 * en serverless no hay puerto que escuchar y hacerlo deja la función colgada
 * hasta agotar el tiempo de espera.
 *
 * La app se construye una sola vez por instancia, al importar el módulo, de
 * modo que las invocaciones sobre una instancia tibia reutilizan el token de
 * PayPal y el inventario en memoria.
 *
 * El vercel.json de este directorio reescribe todas las rutas hacia aquí, así
 * que el enrutador de Express sigue viendo las URLs completas (/health,
 * /api/asientos/..., /api-docs) y no hay que duplicar el enrutado.
 */
const { app } = createApp();

export default app;
