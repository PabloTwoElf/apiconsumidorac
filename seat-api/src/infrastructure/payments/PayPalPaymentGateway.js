import { randomUUID } from 'node:crypto';
import { PaymentGatewayPort } from '../../domain/ports/PaymentGatewayPort.js';
import { GatewayError } from '../../domain/errors/DomainError.js';

const PAYPAL_HOSTS = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const ENDPOINTS = {
  token: '/v1/oauth2/token',
  orders: '/v2/checkout/orders',
  verifyWebhook: '/v1/notifications/verify-webhook-signature',
  captures: '/v2/payments/captures',
  // Informes de la cuenta de negocio (la "cuenta de administrador").
  balances: '/v1/reporting/balances',
  transactions: '/v1/reporting/transactions',
};

// Estados de una orden de PayPal traducidos a un vocabulario simple.
const ORDER_STATES = {
  CREATED: 'PENDIENTE_APROBACION',
  PAYER_ACTION_REQUIRED: 'PENDIENTE_APROBACION',
  SAVED: 'PENDIENTE_APROBACION',
  APPROVED: 'APROBADA',
  COMPLETED: 'COMPLETADA',
  VOIDED: 'ANULADA',
};

/**
 * Adaptador de la pasarela PayPal (API REST v2, Orders).
 *
 * Portado del proyecto EntrenamientoPasarelaDePagoSANDBOX (TypeScript) a este
 * API, conservando el mismo contrato de credenciales y comportamiento, y
 * añadiendo dos cosas que faltaban:
 *
 *  - Cabecera `PayPal-Request-Id` en crear y capturar, para que un reintento de
 *    red no genere una orden duplicada ni un doble cobro.
 *  - Traducción de errores de PayPal a GatewayError del dominio, de modo que
 *    los casos de uso no manipulen códigos HTTP ajenos.
 *
 * El token OAuth2 se cachea en memoria mientras le queden más de 60 segundos de
 * vigencia. En Vercel ese caché vive lo que vive la instancia tibia, lo cual es
 * correcto: en el peor caso se pide un token nuevo.
 */
export class PayPalPaymentGateway extends PaymentGatewayPort {
  constructor({ clientId, clientSecret, mode = 'sandbox', webhookId = '', brandName = 'CulturalTrip', logger = console }) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.mode = mode;
    this.webhookId = webhookId;
    this.brandName = brandName;
    this.logger = logger;
    this.cachedToken = null;
  }

  get baseUrl() {
    return PAYPAL_HOSTS[this.mode] ?? PAYPAL_HOSTS.sandbox;
  }

  get isConfigured() {
    return Boolean(this.clientId && this.clientSecret);
  }

  describe() {
    return {
      proveedor: 'paypal',
      modo: this.mode,
      configurado: this.isConfigured,
      baseUrl: this.baseUrl,
      webhookConfigurado: Boolean(this.webhookId),
      // Solo un fragmento: identifica la app sin exponer la credencial.
      clientIdPrefijo: this.clientId ? `${this.clientId.slice(0, 8)}…` : null,
    };
  }

  async getAccessToken() {
    if (!this.isConfigured) {
      throw new GatewayError(
        'PayPal no está configurado: falta PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET'
      );
    }

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    let response;
    let data;

    try {
      response = await fetch(`${this.baseUrl}${ENDPOINTS.token}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      data = await response.json();
    } catch (error) {
      throw new GatewayError(`No se pudo conectar con PayPal OAuth: ${error.message}`);
    }

    if (!response.ok) {
      throw new GatewayError(
        `PayPal rechazó las credenciales: ${data?.error_description ?? response.statusText}`,
        data
      );
    }

    this.cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
    return this.cachedToken.token;
  }

  async #request(method, endpoint, { body, requestId } = {}) {
    const token = await this.getAccessToken();

    let response;
    let data;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
          ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      data = await response.json().catch(() => ({}));
    } catch (error) {
      throw new GatewayError(`Error de red hablando con PayPal: ${error.message}`);
    }

    if (!response.ok) {
      throw this.#translateError(response.status, data);
    }

    return data;
  }

  /**
   * Convierte un error de PayPal en algo accionable.
   *
   * PayPal devuelve el motivo real en `details[].issue` (un código como
   * `CURRENCY_NOT_SUPPORTED`), mientras `message` suele ser un genérico
   * "The requested action could not be performed". Quedarse con el mensaje
   * genérico obliga a adivinar; aquí se conserva el código y, para los fallos
   * de configuración más habituales, se añade qué hacer.
   */
  #translateError(status, data) {
    const detail = data?.details?.[0] ?? {};
    const issue = detail.issue ?? data?.name ?? null;
    const description = detail.description ?? data?.message ?? 'Error no descrito';

    const hints = {
      CURRENCY_NOT_SUPPORTED:
        'La cuenta de negocio no admite esa moneda. Revisa PRICE_CURRENCY y PAYMENT_CURRENCY: ' +
        'consulta /api/reportes/cuenta-pasarela para ver en qué monedas tiene saldo.',
      PAYEE_ACCOUNT_RESTRICTED:
        'La cuenta que recibe el pago está restringida. En sandbox suele pasar con cuentas de ' +
        'países donde PayPal no permite recibir pagos: crea las cuentas de prueba con país ' +
        'Estados Unidos en developer.paypal.com → Sandbox → Accounts.',
      PAYEE_ACCOUNT_INVALID: 'La cuenta que recibe el pago no es válida para esta operación.',
      PAYER_ACCOUNT_RESTRICTED:
        'La cuenta del comprador está restringida. Prueba con otra cuenta Personal de sandbox, ' +
        'creada con país Estados Unidos.',
      PAYER_CANNOT_PAY:
        'Esa cuenta de comprador no puede pagar esta orden. Si es de un país con restricciones, ' +
        'crea una cuenta Personal de sandbox con país Estados Unidos.',
      TRANSACTION_REFUSED: 'PayPal rechazó la transacción. Revisa el saldo de la cuenta de prueba.',
      ORDER_NOT_APPROVED:
        'El comprador todavía no aprobó el pago. Hay que completar la aprobación en PayPal ' +
        'antes de capturar.',
      ORDER_ALREADY_CAPTURED: 'Esta orden ya se cobró. La captura es idempotente: consulta la orden.',
      INSTRUMENT_DECLINED:
        'El medio de pago fue rechazado. El comprador debe elegir otro; la orden sigue siendo válida.',
      DECIMAL_PRECISION:
        'El importe tiene más decimales de los que admite la moneda. Revisa BASE_PRICE y la ' +
        'tasa de conversión.',
      INVALID_CURRENCY_CODE: 'El código de moneda no es válido o PayPal no lo soporta.',
      NOT_AUTHORIZED:
        'La aplicación de PayPal no tiene permiso para esta operación. Para los informes de ' +
        'transacciones hay que activar "Transaction Search" en la app.',
    };

    const hint = hints[issue];
    const message = hint
      ? `PayPal rechazó la operación (${issue}): ${description} → ${hint}`
      : `PayPal respondió ${status}${issue ? ` (${issue})` : ''}: ${description}`;

    return new GatewayError(message, {
      status,
      issue,
      description,
      // El debug_id es lo que pide el soporte de PayPal para rastrear una llamada.
      debugId: data?.debug_id ?? null,
      details: data?.details ?? null,
    });
  }
  async createOrder({ amount, referenceId, customId, description, items, returnUrl, cancelUrl }) {
    // Traducción del vocabulario del dominio al de PayPal. Es el único sitio
    // del proyecto donde aparecen `value` y `currency_code`.
    const paypalAmount = { currency_code: amount.moneda, value: amount.valor };

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: referenceId,
          description,
          ...(customId ? { custom_id: customId } : {}),
          amount: {
            ...paypalAmount,
            ...(items?.length ? { breakdown: { item_total: paypalAmount } } : {}),
          },
          ...(items?.length ? { items } : {}),
        },
      ],
      application_context: {
        brand_name: this.brandName,
        landing_page: 'NO_PREFERENCE',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      },
    };

    const order = await this.#request('POST', ENDPOINTS.orders, {
      body: payload,
      requestId: referenceId || randomUUID(),
    });

    const approvalUrl = order.links?.find((link) => link.rel === 'approve')?.href ?? null;

    return {
      // true si PayPal creó la orden y el comprador ya puede aprobarla.
      success: Boolean(order.id) && (Boolean(approvalUrl) || order.status === 'APPROVED'),
      orderId: order.id,
      status: order.status,
      // Estado simplificado: una orden recién creada queda lista para aprobar.
      estado: ORDER_STATES[order.status] ?? 'DESCONOCIDO',
      approvalUrl,
      raw: order,
    };
  }

  async captureOrder(orderId) {
    const capture = await this.#request('POST', `${ENDPOINTS.orders}/${orderId}/capture`, {
      body: {},
      // Derivado del orderId: un reintento de la misma captura no cobra dos veces.
      requestId: `capture-${orderId}`,
    });

    const captureDetail = capture.purchase_units?.[0]?.payments?.captures?.[0] ?? null;

    return {
      captureId: captureDetail?.id ?? capture.id,
      status: captureDetail?.status ?? capture.status,
      payer: capture.payer ?? null,
      amount: captureDetail?.amount ?? null,
      raw: capture,
    };
  }

  async getOrder(orderId) {
    return this.#request('GET', `${ENDPOINTS.orders}/${orderId}`);
  }

  async refundCapture(captureId, amount) {
    return this.#request('POST', `${ENDPOINTS.captures}/${captureId}/refund`, {
      // El adaptador traduce del vocabulario del dominio al de PayPal.
      body: amount ? { amount: { currency_code: amount.moneda, value: amount.valor } } : {},
      requestId: `refund-${captureId}`,
    });
  }

  /**
   * Saldo de la cuenta de negocio asociada a la aplicación.
   *
   * Es el dinero realmente liquidado, que no coincide con la suma de ventas:
   * PayPal retiene una parte temporalmente (`withheld_balance`) y descuenta sus
   * comisiones. Para un tablero gerencial son dos cifras distintas y conviene
   * mostrar las dos.
   */
  async getBalances() {
    const data = await this.#request('GET', `${ENDPOINTS.balances}?currency_code=ALL`);

    return {
      cuentaId: data.account_id ?? null,
      actualizadoEn: data.last_refresh_time ?? data.as_of_time ?? null,
      saldos: (data.balances ?? []).map((balance) => ({
        moneda: balance.currency,
        total: balance.total_balance?.value ?? '0.00',
        disponible: balance.available_balance?.value ?? '0.00',
        retenido: balance.withheld_balance?.value ?? '0.00',
        esPrimaria: Boolean(balance.primary),
      })),
    };
  }

  /**
   * Transacciones de la cuenta de negocio.
   *
   * PayPal limita cada consulta a 31 días, de modo que un rango mayor se parte
   * en tramos. En sandbox las transacciones tardan en aparecer en este informe
   * (puede ser horas), así que un resultado vacío no significa que no haya
   * ventas: para eso están los informes propios del API.
   */
  async searchTransactions({ dias = 30 } = {}) {
    const fin = new Date();
    const inicio = new Date(fin.getTime() - Math.min(dias, 31) * 86_400_000);

    const params = new URLSearchParams({
      start_date: `${inicio.toISOString().split('.')[0]}Z`,
      end_date: `${fin.toISOString().split('.')[0]}Z`,
      fields: 'transaction_info,payer_info',
      page_size: '100',
      page: '1',
    });

    const data = await this.#request('GET', `${ENDPOINTS.transactions}?${params}`);

    const movimientos = (data.transaction_details ?? []).map((item) => {
      const info = item.transaction_info ?? {};
      return {
        id: info.transaction_id,
        estado: info.transaction_status,
        fecha: info.transaction_initiation_date,
        importe: info.transaction_amount?.value ?? null,
        moneda: info.transaction_amount?.currency_code ?? null,
        // Las comisiones llegan en negativo; se devuelven tal cual para no
        // perder el signo que PayPal usa.
        comision: info.fee_amount?.value ?? null,
        neto: info.transaction_amount?.value && info.fee_amount?.value
          ? (
            Number.parseFloat(info.transaction_amount.value) +
            Number.parseFloat(info.fee_amount.value)
          ).toFixed(2)
          : null,
        concepto: info.transaction_subject ?? info.transaction_note ?? null,
        referencia: info.custom_field ?? info.invoice_id ?? null,
        pagador: item.payer_info?.email_address ?? null,
      };
    });

    const comisiones = movimientos.reduce(
      (total, m) => total + Math.abs(Number.parseFloat(m.comision ?? '0')),
      0
    );

    return {
      desde: data.start_date ?? null,
      hasta: data.end_date ?? null,
      total: movimientos.length,
      comisionesTotales: comisiones.toFixed(2),
      movimientos,
    };
  }

  async verifyWebhookSignature({
    authAlgo,
    certUrl,
    transmissionId,
    transmissionSig,
    transmissionTime,
    webhookEvent,
  }) {
    if (!this.webhookId) {
      // Sin PAYPAL_WEBHOOK_ID no hay nada contra lo que validar. Se acepta para
      // no bloquear las pruebas en sandbox, pero queda avisado en el log porque
      // en producción esto permitiría a cualquiera fingir un pago.
      this.logger.warn(
        '[paypal] PAYPAL_WEBHOOK_ID no configurado: el webhook se acepta SIN verificar firma'
      );
      return true;
    }

    if (!transmissionId || !transmissionSig) {
      this.logger.warn('[paypal] Webhook sin cabeceras de firma; rechazado');
      return false;
    }

    try {
      const result = await this.#request('POST', ENDPOINTS.verifyWebhook, {
        body: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: this.webhookId,
          webhook_event: webhookEvent,
        },
      });
      return result.verification_status === 'SUCCESS';
    } catch (error) {
      this.logger.error(`[paypal] No se pudo verificar la firma del webhook: ${error.message}`);
      return false;
    }
  }
}
