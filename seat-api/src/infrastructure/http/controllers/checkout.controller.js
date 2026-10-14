/**
 * Controlador de checkout con PayPal (la "C" del MVC para pagos).
 *
 * Igual que AsientosController: solo traduce HTTP ↔ casos de uso. Toda la
 * orquestación (validar holds, cotizar, cobrar, reservar) vive en
 * application/use-cases.
 */
export class CheckoutController {
  constructor({ useCases, paymentGateway, publicBaseUrl, appReturnBaseUrl = '', appReturnPath = '/' }) {
    this.useCases = useCases;
    this.paymentGateway = paymentGateway;
    this.publicBaseUrl = publicBaseUrl;
    this.appReturnBaseUrl = appReturnBaseUrl;
    this.appReturnPath = appReturnPath;
  }

  configuracion = (_req, res) => {
    res.json({
      ok: true,
      pasarela: this.paymentGateway.describe(),
      // El clientId es público por diseño: el SDK del navegador lo necesita.
      clientId: this.paymentGateway.clientId || null,
      publicBaseUrl: this.publicBaseUrl,
    });
  };

  crearOrden = async (req, res, next) => {
    try {
      const result = await this.useCases.createCheckoutOrder.execute({
        holdIds: req.body.holdIds,
        userId: req.body.userId,
        returnUrl: req.body.returnUrl,
        cancelUrl: req.body.cancelUrl,
        descripcion: req.body.descripcion,
        // Si el consumidor no dice a dónde volver, se deduce de su propio
        // origen: así un cambio de puerto en desarrollo no rompe el retorno.
        origin: req.headers.origin ?? null,
      });
      res.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  capturarOrden = async (req, res, next) => {
    try {
      const result = await this.useCases.captureCheckoutOrder.execute({
        orderId: req.body.orderId ?? req.params.orderId,
        userId: req.body.userId ?? null,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  consultarOrden = async (req, res, next) => {
    try {
      const result = await this.useCases.getCheckoutOrder.execute({
        orderId: req.params.orderId,
        incluirPaypal: req.query.paypal === 'true',
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  };

  webhook = async (req, res, next) => {
    try {
      const result = await this.useCases.handlePaymentWebhook.execute({
        headers: req.headers,
        event: req.body,
      });

      // Firma inválida → 400 para que PayPal lo marque como fallo de entrega.
      // Cualquier otro caso → 200, porque un error nuestro provocaría que
      // PayPal reintente el mismo evento durante días.
      res.status(result.aceptado ? 200 : 400).json({ ok: result.aceptado, ...result });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Páginas de retorno que PayPal invoca tras aprobar o cancelar. Son las
   * return_url/cancel_url por defecto cuando el consumidor no envía las suyas.
   *
   * El API no muestra aquí ninguna pantalla: reenvía al programa principal
   * (APP_RETURN_BASE_URL) conservando el identificador de la orden, que es lo
   * que esa aplicación necesita para capturar el pago. Si no hay destino
   * configurado se queda en el panel del propio API, que sabe retomar la
   * captura a partir de los mismos parámetros.
   */
  async #redirectToApp(res, { orderId, estado, payer, campo }) {
    const params = new URLSearchParams({ orden: orderId ?? '', estado });
    if (payer) params.set('payer', payer);

    // El destino se leyó al crear la orden y viaja guardado en ella, así que
    // vuelve exactamente a la aplicación que inició la compra, en el puerto que
    // tuviera entonces. Si la orden ya no existe se recurre a la configuración
    // y, en último término, al panel del propio API.
    let destino = null;
    if (orderId) {
      try {
        const { orden } = await this.useCases.getCheckoutOrder.execute({ orderId });
        destino = orden[campo] ?? orden.returnTo ?? null;
      } catch {
        /* orden desconocida: se usa el destino por configuración */
      }
    }

    if (!destino) {
      destino = this.appReturnBaseUrl ? `${this.appReturnBaseUrl}${this.appReturnPath}` : '/';
    }

    res.redirect(`${destino}?${params}`);
  }

  retorno = async (req, res, next) => {
    try {
      await this.#redirectToApp(res, {
        // PayPal devuelve el id de la orden en el parámetro `token`.
        orderId: req.query.token,
        payer: req.query.PayerID,
        estado: 'aprobada',
        campo: 'returnTo',
      });
    } catch (error) {
      next(error);
    }
  };

  cancelado = async (req, res, next) => {
    try {
      await this.#redirectToApp(res, {
        orderId: req.query.token,
        estado: 'cancelada',
        campo: 'cancelTo',
      });
    } catch (error) {
      next(error);
    }
  };
}
