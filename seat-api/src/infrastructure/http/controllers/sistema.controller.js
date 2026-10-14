import { renderDashboard } from '../views/dashboard.view.js';

/**
 * Controlador de sistema: salud, diagnóstico y el panel visual.
 *
 * El panel (la "V" del MVC) es una vista servida por el propio API, de modo que
 * abrir la URL del despliegue en Vercel confirma de un vistazo que todo quedó
 * en pie: build, variables de entorno, CORS y conexión con PayPal.
 */
export class SistemaController {
  constructor({ env, seatRepository, orderRepository, paymentGateway, pricingPolicy, seatLayout }) {
    this.env = env;
    this.seatRepository = seatRepository;
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
    this.pricingPolicy = pricingPolicy;
    this.seatLayout = seatLayout;
    this.startedAt = Date.now();
  }

  /** Comprobación mínima, la que consultan Vercel y el monitor de uptime. */
  health = (_req, res) => {
    res.json({ ok: true, status: 'UP', timestamp: new Date().toISOString() });
  };

  /**
   * Diagnóstico completo que alimenta el panel. Nunca expone secretos: del
   * client ID solo viaja un prefijo y el secret no aparece en absoluto.
   */
  diagnostico = (_req, res) => {
    res.json({
      ok: true,
      servicio: 'seat-api',
      version: '2.0.0',
      arquitectura: 'hexagonal (puertos y adaptadores) + MVC en la capa HTTP',
      entorno: {
        nodeEnv: this.env.NODE_ENV,
        nodeVersion: process.version,
        serverless: this.env.IS_SERVERLESS,
        plataforma: this.env.IS_SERVERLESS ? 'Vercel Functions' : 'Node.js (servidor persistente)',
        publicBaseUrl: this.env.PUBLIC_BASE_URL,
        corsPermitidos: this.env.ALLOWED_ORIGINS.length > 0 ? this.env.ALLOWED_ORIGINS : ['(dev) todos'],
        uptimeSegundos: Math.round((Date.now() - this.startedAt) / 1000),
      },
      asientos: {
        totalPorBus: this.seatLayout.totalSeats,
        asientosPorFila: this.seatLayout.seatsPerRow,
        holdTtlMs: this.env.SEAT_HOLD_TTL_MS,
        purgaCadaMs: this.env.PURGE_INTERVAL_MS,
        almacenamiento: 'InMemorySeatRepository',
        ...this.seatRepository.stats(),
      },
      precios: {
        moneda: this.pricingPolicy.currency,
        precioUnitario: this.pricingPolicy.basePrice,
        maxAsientos: this.pricingPolicy.maxSeats,
        descuentoCorporativoDesde: this.pricingPolicy.corporateFrom,
        tramosDescuento: this.pricingPolicy.discountTiers,
        monedaCobro: this.env.PAYMENT_CURRENCY,
        tasaConversion: this.env.PAYMENT_FX_RATE,
      },
      pagos: {
        ...this.paymentGateway.describe(),
        ordenes: this.orderRepository.stats(),
      },
    });
  };

  /**
   * Verifica de verdad la conexión con PayPal pidiendo un token OAuth2.
   * Es la prueba que distingue "las variables están puestas" de "las
   * credenciales funcionan".
   */
  verificarPaypal = async (_req, res) => {
    const inicio = Date.now();
    try {
      await this.paymentGateway.getAccessToken();
      res.json({
        ok: true,
        conectado: true,
        mensaje: `Autenticación correcta con PayPal (${this.paymentGateway.mode})`,
        latenciaMs: Date.now() - inicio,
        ...this.paymentGateway.describe(),
      });
    } catch (error) {
      res.status(502).json({
        ok: false,
        conectado: false,
        mensaje: error.message,
        latenciaMs: Date.now() - inicio,
        ...this.paymentGateway.describe(),
      });
    }
  };

  /** Panel glassmorphism servido en la raíz del API. */
  panel = (_req, res) => {
    res.type('html').send(
      renderDashboard({
        publicBaseUrl: this.env.PUBLIC_BASE_URL,
        nodeEnv: this.env.NODE_ENV,
        serverless: this.env.IS_SERVERLESS,
        totalSeats: this.seatLayout.totalSeats,
        seatsPerRow: this.seatLayout.seatsPerRow,
        holdTtlMs: this.env.SEAT_HOLD_TTL_MS,
        currency: this.pricingPolicy.currency,
        basePrice: this.pricingPolicy.basePrice,
        maxSeats: this.pricingPolicy.maxSeats,
        corporateFrom: this.pricingPolicy.corporateFrom,
        paymentCurrency: this.env.PAYMENT_CURRENCY,
        paypalMode: this.env.PAYPAL_MODE,
        paypalClientId: this.env.PAYPAL_CLIENT_ID,
      })
    );
  };
}
