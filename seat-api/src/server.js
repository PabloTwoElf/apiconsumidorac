import { createApp } from './infrastructure/http/app.js';
import { env, configWarnings } from './infrastructure/config/env.js';

/**
 * Arranque para entornos con servidor persistente (desarrollo local, Render,
 * Railway, un contenedor...).
 *
 * Vercel NO usa este archivo: allí el punto de entrada es api/index.js, que
 * exporta la app sin escucharla. Llamar a listen() en una función serverless
 * hace que el despliegue se quede sin responder, y era una de las causas de que
 * el despliegue anterior no funcionara.
 */
const { app, container } = createApp();

// La purga periódica solo tiene sentido con un proceso que vive. En serverless
// cada caso de uso purga lo que necesita al empezar, así que no se pierde nada.
const purgeTimer = setInterval(() => {
  try {
    const purged = container.seatRepository.purgeExpiredHolds(Date.now());
    if (purged > 0) console.log(`[purga] ${purged} bloqueo(s) expirado(s) eliminado(s)`);
  } catch (error) {
    console.error('[purga] error:', error.message);
  }
}, env.PURGE_INTERVAL_MS);

// Sin unref, el temporizador mantendría el proceso vivo tras cerrar el servidor.
purgeTimer.unref();

/**
 * Arranca en el primer puerto libre a partir del configurado.
 *
 * Si el puerto está ocupado, lo normal sería abortar con EADDRINUSE y obligar a
 * editar el .env. En su lugar se prueba el siguiente: el frontend descubre el
 * puerto al arrancar (ver vite.config.ts) y `npm run puertos` lo imprime, así
 * que no hay nada que actualizar a mano.
 */
const listenOnFreePort = (startPort, attempts = 10) =>
  new Promise((resolve, reject) => {
    const tryPort = (port, left) => {
      const srv = app.listen(port);

      srv.once('listening', () => resolve(srv));
      srv.once('error', (error) => {
        if (error.code !== 'EADDRINUSE' || left === 0) return reject(error);
        console.log(`[arranque] El puerto ${port} está ocupado; probando el ${port + 1}…`);
        tryPort(port + 1, left - 1);
      });
    };

    tryPort(startPort, attempts);
  });

const server = await listenOnFreePort(env.PORT);
const port = server.address().port;

// PUBLIC_BASE_URL se calculó con el puerto configurado; si acabamos en otro,
// las URLs que se imprimen y las que recibe PayPal deben reflejar el real.
const baseUrl = env.PUBLIC_BASE_URL.replace(`:${env.PORT}`, `:${port}`);

{
  const warnings = configWarnings();

  console.log(`
╔══════════════════════════════════════════════╗
║  CulturalTrip · Seat API  v2.0.0             ║
║  Arquitectura hexagonal + MVC                ║
╚══════════════════════════════════════════════╝

  Puerto         ${port}${port !== env.PORT ? `  (el ${env.PORT} estaba ocupado)` : ''}

  Panel          ${baseUrl}/
  Documentación  ${baseUrl}/api-docs
  Salud          ${baseUrl}/health
  Diagnóstico    ${baseUrl}/api/sistema/diagnostico

  Entorno        ${env.NODE_ENV}  ·  Node ${process.version}
  CORS           ${
    env.NODE_ENV !== 'production'
      ? '(dev) cualquier puerto de localhost'
      : env.ALLOWED_ORIGINS.join(', ') || 'NINGUNO configurado'
  }
  Retorno        ${env.APP_RETURN_BASE_URL ? env.APP_RETURN_BASE_URL + env.APP_RETURN_PATH : 'según el origen de cada orden'}
  Hold TTL       ${Math.round(env.SEAT_HOLD_TTL_MS / 60000)} min
  Precio         ${env.BASE_PRICE.toLocaleString('es-CO')} ${env.PRICE_CURRENCY} / asiento
  PayPal         ${env.PAYPAL_MODE}${env.PAYPAL_CLIENT_ID ? ' · credenciales presentes' : ' · SIN credenciales'}
${warnings.length > 0 ? `\n  Avisos:\n${warnings.map((w) => `   ⚠ ${w}`).join('\n')}\n` : ''}`);
}

// Cierre ordenado: sin esto, un reinicio deja el puerto ocupado unos segundos.
const shutdown = (signal) => {
  console.log(`\n[${signal}] Cerrando el servidor…`);
  clearInterval(purgeTimer);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
