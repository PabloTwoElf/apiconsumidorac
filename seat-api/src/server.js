import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import asientosRoutes from './routes/asientos.routes.js';
import * as asientosService from './services/asientos.service.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const PURGE_INTERVAL_MS = parseInt(process.env.PURGE_INTERVAL_MS || '120000', 10);

// Configuración CORS
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : NODE_ENV === 'development'
    ? '*'
    : [];

const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
  optionsSuccessStatus: 200,
};

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Seat Availability API',
      version: '1.0.0',
      description:
        'API REST para gestión de disponibilidad de asientos con holds y reservas',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            error: { type: 'string' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: true },
          },
        },
        AvailableSeatsResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            rutaId: { type: 'string' },
            fecha: { type: 'string', format: 'date' },
            available: { type: 'array', items: { type: 'number' } },
            total: { type: 'number' },
          },
        },
        HoldResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            holdId: { type: 'string' },
            expiresAt: { type: 'number' },
            remainingMs: { type: 'number' },
          },
        },
        HoldsListResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            holds: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  holdId: { type: 'string' },
                  rutaId: { type: 'string' },
                  fecha: { type: 'string', format: 'date' },
                  asiento: { type: 'number' },
                  userId: { type: 'string' },
                  expiresAt: { type: 'number' },
                  remainingMs: { type: 'number' },
                },
              },
            },
            count: { type: 'number' },
          },
        },
        ConfirmResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            reservedAt: { type: 'number' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());

// Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => {
  res.json(swaggerSpec);
});

// Health check
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// API Routes
app.use('/api/asientos', asientosRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Endpoint not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    ok: false,
    error: 'Internal server error',
  });
});

// Purga automática periódica
setInterval(() => {
  const purged = asientosService.purgeExpiredHolds();
  if (purged > 0) {
    console.log(`[Purge] Removed ${purged} expired holds`);
  }
}, PURGE_INTERVAL_MS);

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Seat Availability API                ║
║   Node.js ${process.version.split('.')[0]}+ | Express      ║
╚════════════════════════════════════════╝

🚀 Server running on port ${PORT}
📚 Documentation: http://localhost:${PORT}/api-docs
🏥 Health check: http://localhost:${PORT}/health
🌍 Environment: ${NODE_ENV}
🔒 CORS Origins: ${Array.isArray(ALLOWED_ORIGINS) ? ALLOWED_ORIGINS.join(', ') : ALLOWED_ORIGINS}
⏱️  Hold TTL: ${process.env.SEAT_HOLD_TTL_MS || 600000}ms
🧹 Purge interval: ${PURGE_INTERVAL_MS}ms
  `);
});
