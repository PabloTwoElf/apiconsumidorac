import { env } from './env.js';
import { SystemClock } from '../../domain/ports/ClockPort.js';
import { PricingPolicy } from '../../domain/services/PricingPolicy.js';
import { SeatLayout } from '../../domain/services/SeatLayout.js';
import { SalesReport } from '../../domain/services/SalesReport.js';
import { InMemorySeatRepository } from '../persistence/InMemorySeatRepository.js';
import { InMemoryOrderRepository } from '../persistence/InMemoryOrderRepository.js';
import { PayPalPaymentGateway } from '../payments/PayPalPaymentGateway.js';

import { GetSeatAvailability } from '../../application/use-cases/GetSeatAvailability.js';
import { GetSeatViewModel } from '../../application/use-cases/GetSeatViewModel.js';
import { HoldSeats } from '../../application/use-cases/HoldSeats.js';
import { ReleaseHold } from '../../application/use-cases/ReleaseHold.js';
import { ListHolds } from '../../application/use-cases/ListHolds.js';
import { ConfirmReservation } from '../../application/use-cases/ConfirmReservation.js';
import { CalculatePrice } from '../../application/use-cases/CalculatePrice.js';
import { CreateCheckoutOrder } from '../../application/use-cases/CreateCheckoutOrder.js';
import { CaptureCheckoutOrder } from '../../application/use-cases/CaptureCheckoutOrder.js';
import { DeliverOrderSeats } from '../../application/use-cases/DeliverOrderSeats.js';
import { ReviewPendingPayment } from '../../application/use-cases/ReviewPendingPayment.js';
import { GetCheckoutOrder } from '../../application/use-cases/GetCheckoutOrder.js';
import { HandlePaymentWebhook } from '../../application/use-cases/HandlePaymentWebhook.js';
import { GetSalesReport } from '../../application/use-cases/GetSalesReport.js';
import { GetMerchantAccount } from '../../application/use-cases/GetMerchantAccount.js';

/**
 * Raíz de composición (composition root).
 *
 * Único lugar del proyecto donde se eligen implementaciones concretas. Los casos
 * de uso reciben sus dependencias ya construidas y nunca hacen `new` de un
 * adaptador: por eso se pueden probar con dobles sin levantar Express ni llamar
 * a PayPal.
 *
 * Para cambiar de almacenamiento o de pasarela se edita este archivo y nada más.
 */
export const buildContainer = ({ logger = console } = {}) => {
  // ---- Puertos de salida (adaptadores concretos) ----
  const clock = new SystemClock();
  const seatRepository = new InMemorySeatRepository();
  const orderRepository = new InMemoryOrderRepository();
  const paymentGateway = new PayPalPaymentGateway({
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    mode: env.PAYPAL_MODE,
    webhookId: env.PAYPAL_WEBHOOK_ID,
    brandName: env.PAYPAL_BRAND_NAME,
    logger,
  });

  // ---- Servicios de dominio ----
  const seatLayout = new SeatLayout({
    totalSeats: env.TOTAL_SEATS,
    seatsPerRow: env.SEATS_PER_ROW,
  });

  const pricingPolicy = new PricingPolicy({
    basePrice: env.BASE_PRICE,
    currency: env.PRICE_CURRENCY,
    // Umbral de asientos → fracción de descuento.
    discountTiers: { 2: 0.05, 3: 0.07, 4: 0.1, 5: 0.2 },
    maxSeats: env.MAX_SEATS_PER_BOOKING,
    corporateFrom: env.CORPORATE_DISCOUNT_FROM,
  });

  const salesReport = new SalesReport({
    pricingPolicy,
    seatLayout,
    paymentCurrency: env.PAYMENT_CURRENCY,
    fxRate: env.PAYMENT_FX_RATE,
  });

  const shared = { seatRepository, seatLayout, pricingPolicy, clock, holdTtlMs: env.SEAT_HOLD_TTL_MS };

  // ---- Casos de uso ----
  const confirmReservation = new ConfirmReservation({ seatRepository, clock });

  const deliverOrderSeats = new DeliverOrderSeats({ seatRepository, confirmReservation });

  const captureCheckoutOrder = new CaptureCheckoutOrder({
    seatRepository,
    orderRepository,
    paymentGateway,
    deliverOrderSeats,
    clock,
  });

  const useCases = {
    getSeatAvailability: new GetSeatAvailability(shared),
    getSeatViewModel: new GetSeatViewModel(shared),
    holdSeats: new HoldSeats(shared),
    releaseHold: new ReleaseHold({ seatRepository, clock }),
    listHolds: new ListHolds({ seatRepository, clock }),
    confirmReservation,
    calculatePrice: new CalculatePrice({
      pricingPolicy,
      paymentCurrency: env.PAYMENT_CURRENCY,
      fxRate: env.PAYMENT_FX_RATE,
    }),
    createCheckoutOrder: new CreateCheckoutOrder({
      seatRepository,
      orderRepository,
      paymentGateway,
      pricingPolicy,
      clock,
      paymentCurrency: env.PAYMENT_CURRENCY,
      fxRate: env.PAYMENT_FX_RATE,
      publicBaseUrl: env.PUBLIC_BASE_URL,
      appReturnBaseUrl: env.APP_RETURN_BASE_URL,
      appReturnPath: env.APP_RETURN_PATH,
    }),
    captureCheckoutOrder,
    getCheckoutOrder: new GetCheckoutOrder({ orderRepository, paymentGateway }),
    handlePaymentWebhook: new HandlePaymentWebhook({
      orderRepository,
      paymentGateway,
      captureCheckoutOrder,
      clock,
      logger,
    }),
    reviewPendingPayment: new ReviewPendingPayment({
      orderRepository,
      seatRepository,
      deliverOrderSeats,
      clock,
    }),
    getSalesReport: new GetSalesReport({ orderRepository, seatRepository, salesReport, clock }),
    getMerchantAccount: new GetMerchantAccount({ paymentGateway }),
  };

  return {
    env,
    clock,
    logger,
    seatLayout,
    pricingPolicy,
    seatRepository,
    orderRepository,
    paymentGateway,
    useCases,
  };
};
