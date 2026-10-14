/**
 * Carga del SDK de PayPal.
 *
 * El script se inyecta una sola vez y la promesa se memoriza: en React 18 con
 * StrictMode los efectos se ejecutan dos veces en desarrollo, y sin esta
 * salvaguarda se añadirían dos etiquetas <script> y los botones se pintarían
 * duplicados.
 */

export interface PayPalButtonsConfig {
  style?: Record<string, string | number>;
  createOrder: () => Promise<string> | string;
  onApprove: (data: { orderID: string }) => Promise<void> | void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}

export interface PayPalNamespace {
  Buttons: (config: PayPalButtonsConfig) => {
    render: (target: HTMLElement) => Promise<void>;
    close: () => void;
  };
}

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

let pending: Promise<PayPalNamespace> | null = null;
let loadedKey = '';

export function loadPayPal(clientId: string, currency: string): Promise<PayPalNamespace> {
  const key = `${clientId}|${currency}`;

  // Si cambiaran el clientId o la moneda habría que recargar el SDK; en la
  // práctica no ocurre, pero devolver el caché equivocado sería difícil de
  // depurar, así que se comprueba.
  if (pending && loadedKey === key) return pending;
  if (window.paypal && loadedKey === key) return Promise.resolve(window.paypal);

  loadedKey = key;
  pending = new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      'client-id': clientId,
      currency,
      intent: 'capture',
      // Se ocultan tarjeta y crédito: este flujo es de cuenta PayPal Sandbox.
      'disable-funding': 'credit,card,paylater',
    });

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?${params}`;
    script.async = true;

    script.onload = () => {
      if (window.paypal) resolve(window.paypal);
      else reject(new Error('El SDK de PayPal cargó pero no expuso window.paypal.'));
    };

    script.onerror = () => {
      pending = null;
      loadedKey = '';
      reject(new Error('No se pudo cargar el SDK de PayPal. Revisa tu conexión o un bloqueador.'));
    };

    document.head.appendChild(script);
  });

  return pending;
}
