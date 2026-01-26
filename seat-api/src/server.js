import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import asientosRoutes from "./routes/asientos.routes.js";
import * as asientosService from "./services/asientos.service.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";
const PURGE_INTERVAL_MS = parseInt(process.env.PURGE_INTERVAL_MS || "120000", 10);

// ======================
// CORS (FIXED)
// ======================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin: (origin, cb) => {
      // Permitir requests sin origin (Postman/curl)
      if (!origin) return cb(null, true);

      // En desarrollo, si no configuraste ALLOWED_ORIGINS, permite todo
      if (NODE_ENV === "development" && allowedOrigins.length === 0) {
        return cb(null, true);
      }

      // En producción: solo orígenes permitidos
      if (allowedOrigins.includes(origin)) return cb(null, true);

      return cb(new Error("CORS bloqueado para este origen: " + origin), false);
    },
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());

// ======================
// Ruta principal → Swagger
// ======================
app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

// ======================
// Swagger (FIXED server url)
// ======================
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Seat Availability API",
      version: "1.0.0",
      description: "API REST para gestión de disponibilidad de asientos con holds y reservas",
      contact: { name: "API Support" },
    },
    servers: [
      {
        url: process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`,
        description: "API server",
      },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: false },
            error: { type: "string" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean", example: true },
          },
        },
        AvailableSeatsResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            rutaId: { type: "string" },
            fecha: { type: "string", format: "date" },
            available: { type: "array", items: { type: "number" } },
            total: { type: "number" },
          },
        },
        HoldResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            holdId: { type: "string" },
            expiresAt: { type: "number" },
            remainingMs: { type: "number" },
          },
        },
        HoldsListResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            holds: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  holdId: { type: "string" },
                  rutaId: { type: "string" },
                  fecha: { type: "string", format: "date" },
                  asiento: { type: "number" },
                  userId: { type: "string" },
                  expiresAt: { type: "number" },
                  remainingMs: { type: "number" },
                },
              },
            },
            count: { type: "number" },
          },
        },
        ConfirmResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            reservedAt: { type: "number" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Ruta principal → Swagger UI
app.get("/", (req, res) => {
  res.redirect("/api-docs");
});

// Swagger endpoints
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));

// ======================
// Routes
// ======================

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
app.get("/health", (req, res) => res.json({ ok: true }));

// ======================
// ENDPOINT PRINCIPAL: CALCULAR PRECIO CON DESCUENTOS
// ======================
/**
 * @swagger
 * /calcular-precio:
 *   post:
 *     summary: Calcula precio total con descuentos automáticos
 *     tags:
 *       - Cálculos de Precio
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cantidad:
 *                 type: number
 *                 example: 3
 *                 description: Cantidad de asientos
 *     responses:
 *       200:
 *         description: Cálculo exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 cantidad:
 *                   type: number
 *                 precioUnitario:
 *                   type: number
 *                 subtotal:
 *                   type: number
 *                 porcentajeDescuento:
 *                   type: number
 *                 montoDescuento:
 *                   type: number
 *                 total:
 *                   type: number
 *                 ahorros:
 *                   type: string
 */
app.post("/calcular-precio", (req, res) => {
  try {
    const { cantidad } = req.body;
    
    if (!cantidad || cantidad < 1) {
      return res.status(400).json({ 
        ok: false, 
        error: "Cantidad debe ser mayor a 0" 
      });
    }

    const pricing = asientosService.calculatePrice(cantidad);
    
    res.json({
      ok: true,
      cantidad: pricing.quantity,
      precioUnitario: pricing.basePrice,
      subtotal: pricing.baseTotal,
      porcentajeDescuento: pricing.discountPercent,
      montoDescuento: pricing.discountAmount,
      total: pricing.total,
      ahorros: pricing.savings,
    });
  } catch (error) {
    console.error("Error en /calcular-precio:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// API Routes
app.use("/api/asientos", asientosRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ ok: false, error: err.message || "Internal server error" });
});

// ======================
// Purge expired holds
// ======================
setInterval(() => {
  try {
    const purged = asientosService.purgeExpiredHolds();
    if (purged > 0) console.log(`[Purge] Removed ${purged} expired holds`);
  } catch (e) {
    console.error("[Purge] error:", e?.message || e);
  }
}, PURGE_INTERVAL_MS);

// Start server
app.listen(PORT, () => {
  const corsInfo =
    allowedOrigins.length > 0
      ? allowedOrigins.join(", ")
      : NODE_ENV === "development"
      ? "(dev) allow all"
      : "(prod) none configured";

  console.log(`
╔════════════════════════════════════════╗
║   Seat Availability API                ║
║   Node.js ${process.version.split(".")[0]}+ | Express      ║
╚════════════════════════════════════════╝

🚀 Server running on port ${PORT}
📚 Documentation: ${process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`}/api-docs
🏥 Health check: ${process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`}/health
🌍 Environment: ${NODE_ENV}
🔒 CORS Origins: ${corsInfo}
⏱️  Hold TTL: ${process.env.SEAT_HOLD_TTL_MS || 600000}ms
🧹 Purge interval: ${PURGE_INTERVAL_MS}ms
  `);
});
