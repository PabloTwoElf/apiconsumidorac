import express from 'express';
import swaggerUi from 'swagger-ui-express';

import { buildContainer } from '../config/container.js';
import { buildCors } from './middlewares/corsMiddleware.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { buildSwaggerSpec } from './swagger.js';
import { buildApiRoutes } from './routes/index.js';
import { AsientosController } from './controllers/asientos.controller.js';
import { CheckoutController } from './controllers/checkout.controller.js';
import { SistemaController } from './controllers/sistema.controller.js';
import { ReportesController } from './controllers/reportes.controller.js';
import { AdminController } from './controllers/admin.controller.js';

/**
 * Adaptador de entrada HTTP: construye la aplicación Express y la conecta al
 * contenedor de dependencias.
 *
 * Devuelve la app SIN llamar a listen(). Esa separación es lo que permite el
 * mismo código en los dos entornos: server.js la escucha en un puerto para
 * desarrollo, y api/index.js la exporta como función serverless para Vercel,
 * donde llamar a listen() hace que el despliegue nunca responda.
 */
export const createApp = ({ logger = console } = {}) => {
  const container = buildContainer({ logger });
  const { env, useCases, paymentGateway, seatRepository, orderRepository, pricingPolicy, seatLayout } = container;

  const app = express();

  // Vercel y Render actúan de proxy; sin esto req.protocol sería http y las
  // URLs absolutas que recibe PayPal saldrían mal formadas.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(buildCors({ allowedOrigins: env.ALLOWED_ORIGINS, nodeEnv: env.NODE_ENV, logger }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ---- Controladores (capa MVC) ----
  const asientosController = new AsientosController({ useCases });
  const checkoutController = new CheckoutController({
    useCases,
    paymentGateway,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    appReturnBaseUrl: env.APP_RETURN_BASE_URL,
    appReturnPath: env.APP_RETURN_PATH,
  });
  const reportesController = new ReportesController({ useCases });
  const adminController = new AdminController({ useCases, adminToken: env.ADMIN_TOKEN });
  const sistemaController = new SistemaController({
    env,
    seatRepository,
    orderRepository,
    paymentGateway,
    pricingPolicy,
    seatLayout,
  });

  // ---- Vista: panel glassmorphism en la raíz ----
  app.get('/', sistemaController.panel);

  // ---- Sistema ----
  /**
   * @swagger
   * /health:
   *   get:
   *     tags: [Sistema]
   *     summary: Comprobación de salud
   *     responses:
   *       200: { description: El servicio responde }
   */
  app.get('/health', sistemaController.health);

  /**
   * @swagger
   * /api/sistema/diagnostico:
   *   get:
   *     tags: [Sistema]
   *     summary: Estado completo del despliegue
   *     description: Entorno, configuración de precios, inventario y pasarela. No expone secretos.
   *     responses:
   *       200: { description: Diagnóstico }
   */
  app.get('/api/sistema/diagnostico', sistemaController.diagnostico);

  /**
   * @swagger
   * /api/sistema/paypal:
   *   get:
   *     tags: [Sistema]
   *     summary: Verifica las credenciales contra PayPal
   *     description: Solicita un token OAuth2 real; distingue "variables puestas" de "credenciales válidas".
   *     responses:
   *       200: { description: Conexión correcta }
   *       502: { description: PayPal rechazó las credenciales o no responde }
   */
  app.get('/api/sistema/paypal', sistemaController.verificarPaypal);

  // ---- Documentación ----
  const swaggerSpec = buildSwaggerSpec({ publicBaseUrl: env.PUBLIC_BASE_URL, logger });
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'CulturalTrip · Seat API',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    })
  );

  // ---- API ----
  app.use('/api', buildApiRoutes({ asientosController, checkoutController, reportesController, adminController }));

  // Alias histórico: el frontend ya desplegado llama a /calcular-precio en la
  // raíz, así que se mantiene además de /api/asientos/calcular-precio.
  app.post('/calcular-precio', asientosController.calcularPrecio);
  app.get('/calcular-precio', asientosController.calcularPrecio);

  // Retornos de PayPal (declarados como return_url/cancel_url por defecto).
  app.get('/checkout/retorno', checkoutController.retorno);
  app.get('/checkout/cancelado', checkoutController.cancelado);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return { app, container };
};
