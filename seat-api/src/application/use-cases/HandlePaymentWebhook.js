/**
 * Caso de uso: procesar notificaciones asíncronas de la pasarela.
 *
 * El webhook es la red de seguridad del flujo: si el comprador aprueba el pago
 * y cierra el navegador antes de que el frontend llame a /capturar-orden,
 * PAYMENT.CAPTURE.COMPLETED llega igual y los asientos se confirman.
 *
 * Siempre responde 200 salvo firma inválida: un error devuelto a PayPal provoca
 * reintentos durante días.
 */
export class HandlePaymentWebhook {
  constructor({ orderRepository, paymentGateway, captureCheckoutOrder, clock, logger = console }) {
    this.orderRepository = orderRepository;
    this.paymentGateway = paymentGateway;
    this.captureCheckoutOrder = captureCheckoutOrder;
    this.clock = clock;
    this.logger = logger;
  }

  async execute({ headers, event }) {
    const valid = await this.paymentGateway.verifyWebhookSignature({
      authAlgo: headers['paypal-auth-algo'],
      certUrl: headers['paypal-cert-url'],
      transmissionId: headers['paypal-transmission-id'],
      transmissionSig: headers['paypal-transmission-sig'],
      transmissionTime: headers['paypal-transmission-time'],
      webhookEvent: event,
    });

    if (!valid) {
      return { aceptado: false, motivo: 'Firma de webhook inválida' };
    }

    const eventType = event?.event_type ?? 'DESCONOCIDO';
    const now = this.clock.now();

    // El id de la orden viaja en distinto sitio según el tipo de evento.
    const orderId =
      event?.resource?.supplementary_data?.related_ids?.order_id ??
      (event?.resource_type === 'checkout-order' ? event?.resource?.id : null);

    const order = orderId ? this.orderRepository.findById(orderId) : null;
    if (order) {
      order.recordWebhook({ eventType, at: now });
      this.orderRepository.save(order);
    }

    let accion = 'ninguna';

    switch (eventType) {
      case 'CHECKOUT.ORDER.APPROVED':
        // El comprador aprobó. Capturamos nosotros para no depender de que el
        // navegador siga abierto.
        if (order && order.isPending) {
          try {
            await this.captureCheckoutOrder.execute({ orderId: order.orderId });
            accion = 'capturada_por_webhook';
          } catch (error) {
            this.logger.warn(`[webhook] No se pudo capturar ${order.orderId}: ${error.message}`);
            accion = 'captura_fallida';
          }
        }
        break;

      case 'PAYMENT.CAPTURE.PENDING':
        // PayPal retiene el pago: pasa a la cola de revisión del administrador.
        if (order && order.isPending) {
          order.markInReview({
            captureId: event?.resource?.id ?? null,
            payer: event?.resource?.payer ?? null,
            captureStatus: 'PENDING',
            at: now,
          });
          this.orderRepository.save(order);
          accion = 'en_revision';
        } else {
          accion = 'ya_registrada';
        }
        break;

      case 'PAYMENT.CAPTURE.COMPLETED':
        // Una orden en revisión la decide el administrador, no el webhook.
        if (order && order.isPending) {
          order.markPaid({
            captureId: event?.resource?.id ?? null,
            payer: event?.resource?.payer ?? null,
            at: now,
          });
          this.orderRepository.save(order);
          accion = 'marcada_pagada';
        } else {
          accion = 'ya_registrada';
        }
        break;

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        if (order) {
          order.markFailed({ reason: eventType, at: now });
          this.orderRepository.save(order);
          accion = 'marcada_fallida';
        }
        break;

      default:
        accion = 'evento_no_manejado';
    }

    this.logger.log(`[webhook] ${eventType} · orden=${orderId ?? 'n/d'} · acción=${accion}`);

    return { aceptado: true, eventType, orderId, accion };
  }
}
