# CulturalTrip · Seat API — contexto y estado del proyecto

> Documento de referencia del API de asientos: qué problema tenía el despliegue,
> cómo quedó estructurado con arquitectura hexagonal + MVC, cómo funciona la
> orquestación con PayPal Sandbox y cómo consumirlo desde el programa principal.
>
> Última actualización: 7 de octubre de 2026 · Versión del API: 2.0.0

---

## 1. Resumen

Este repositorio contiene dos cosas que se despliegan por separado:

| Pieza | Carpeta | Qué es |
|---|---|---|
| **Seat API** | `seat-api/` | API REST de asientos + pasarela PayPal + panel visual |
| **Frontend** | `src/` (raíz) | Aplicación Vite + React de compra, con glassmorphism |
| **Función de Vercel** | `api/index.js` | Sirve el Seat API bajo `/api` del mismo dominio que el frontend |

Un único proyecto de Vercel sirve las dos cosas:

```
https://apiconsumidorac.vercel.app/          → frontend
https://apiconsumidorac.vercel.app/api/...   → Seat API
```

Esto importa porque el **programa principal** (`C:\Repositorios\CulturalTrip`)
ya apunta a `https://apiconsumidorac.vercel.app/api/asientos` en su
`VITE_SEAT_API_URL`, y esa ruta devolvía `404`: el dominio solo servía el
frontend. Ver [§2](#2-por-qué-no-funcionaba-el-despliegue).

El Seat API gestiona la disponibilidad de asientos de un bus, los bloqueos
temporales mientras el comprador decide, el cobro con PayPal Sandbox y la
conversión del bloqueo en reserva definitiva una vez cobrado.

Se hicieron cinco cosas en esta iteración:

1. **Se arregló el despliegue.** Faltaba la configuración de Vercel y el código
   era incompatible con funciones serverless.
2. **Se aplicó arquitectura hexagonal por capas con MVC**, la misma que usa el
   sistema principal. Antes el API no tenía arquitectura definida.
3. **Se integró la pasarela PayPal Sandbox** con orquestación completa: el API
   es ahora el único interlocutor del programa principal.
4. **Se añadió un panel glassmorphism** servido por el propio API, para
   comprobar de un vistazo que el despliegue en Vercel quedó operativo.
5. **Se rehízo el frontend** con el mismo lenguaje visual y, sobre todo, con el
   flujo de compra completo: antes solo bloqueaba asientos y no podía pagar.

---

## 2. Por qué no funcionaba el despliegue

El diagnóstico encontró **seis** causas, no una. La primera es la que explica el
`404` que veía el programa principal:

| # | Problema | Por qué rompía el despliegue |
|---|---|---|
| 1 | **El API no vivía en el dominio que el programa principal consulta** | `VITE_SEAT_API_URL=https://apiconsumidorac.vercel.app/api/asientos`, pero ese dominio solo servía el frontend React. Toda llamada devolvía `404 NOT_FOUND`. |
| 2 | **No existía `vercel.json`** ni carpeta `api/` | Vercel no tenía forma de saber que en el repositorio había un API. |
| 3 | **`app.listen()` en el código de arranque** | En una función serverless no hay puerto que escuchar. La función se queda esperando y agota el tiempo de espera sin responder nunca. |
| 4 | **Dos `render.yaml` en conflicto** | El de la raíz usaba `rootDir: seat-api`; el de dentro usaba `preBuildCommand: cd seat-api \|\| true`, que no hace nada porque cada comando corre en su propio shell. |
| 5 | **Ruta `/` duplicada y Swagger con rutas relativas** | `app.get("/")` estaba declarado dos veces, y `apis: ["./src/routes/*.js"]` se resuelve contra el directorio de trabajo, que en Vercel no es la raíz. La documentación salía vacía. |
| 6 | **`dotenv.config()` dependía del directorio de trabajo** | Al arrancar el API desde la raíz no encontraba `seat-api/.env`. No daba error: se quedaba sin `ALLOWED_ORIGINS`, y una lista vacía significaba *permitir cualquier origen*. Un fallo de configuración se convertía en un CORS abierto, sin ningún síntoma. |

> **Por qué pasó desapercibido:** el `asientosService.js` del programa principal
> tiene un *fallback* silencioso que, ante un `404` o un *timeout*, devuelve una
> lista de asientos inventada y marca `_isFallback: true`. La interfaz seguía
> mostrando asientos, así que el API caída parecía estar funcionando. Conviene
> revisar ese comportamiento: oculta precisamente el fallo que hay que ver.

### Cómo se resolvió

- **`api/index.js` en la raíz** importa la app de `seat-api/src` y la exporta sin
  escucharla. El `vercel.json` de la raíz reparte: las rutas del API van a esa
  función y el resto al `index.html` del frontend. Así un solo dominio sirve
  ambos, el programa principal funciona **sin cambiar su configuración**, y al
  compartir origen desaparecen los problemas de CORS.
- **`seat-api/api/index.js` + `seat-api/vercel.json`** se conservan para poder
  desplegar el API también como proyecto independiente. El código es el mismo:
  `seat-api/src` sigue siendo la única copia.
- **`src/server.js`** quedó solo para entornos con servidor persistente
  (local, Render). Es el único archivo que llama a `listen()`.
- Se eliminó `seat-api/render.yaml` y se dejó un único `render.yaml` correcto en
  la raíz, como alternativa a Vercel.
- Swagger resuelve las rutas de los archivos desde el propio módulo
  (`import.meta.url`) y no desde el directorio de trabajo.
- **`env.js` resuelve `.env` desde su propia ubicación**, no desde el cwd, así
  que el API carga la misma configuración lo arranque quien lo arranque. Y en
  desarrollo sin `ALLOWED_ORIGINS` ahora se aceptan **solo orígenes de
  localhost**, no todos.

La clave es la separación entre **construir** la app y **escucharla**: el mismo
código sirve para los dos entornos porque `createApp()` solo devuelve la app.

```
seat-api/src/.../app.js  createApp()
        │
        ├─→ seat-api/src/server.js   → app.listen(PORT)    local y Render
        ├─→ api/index.js (raíz)      → export default app  Vercel: /api del dominio principal
        └─→ seat-api/api/index.js    → export default app  Vercel: proyecto independiente
```

---

## 2bis. Nada de puertos fijos

Los puertos de desarrollo no son estables: Vite incrementa el suyo cuando está
ocupado, y por eso el programa principal pide el 3000 y acaba en el 3001. Tener
que actualizar `VITE_SEAT_API_URL`, `ALLOWED_ORIGINS` y la URL de retorno en
cada arranque era una fuente constante de fallos difíciles de diagnosticar.

La solución fue dejar de configurar puertos y empezar a **preguntar quién
responde**. Cuatro mecanismos, uno por cada sitio donde antes había un número
escrito a mano:

| Antes | Ahora |
|---|---|
| `VITE_SEAT_API_URL=http://localhost:5008` | El proxy de Vite **descubre el puerto** del API al arrancar; el navegador usa rutas relativas |
| `ALLOWED_ORIGINS` con cada puerto | Fuera de producción se acepta **cualquier puerto de localhost** |
| `APP_RETURN_BASE_URL=http://localhost:3001` | El destino del retorno se **deduce del origen** de quien creó la orden y se guarda **en la orden** |
| `PORT=5008` y fallo si está ocupado | El API **busca el siguiente puerto libre** |

### Cómo se descubre el API

`scripts/ports.mjs` sondea una lista de puertos candidatos en paralelo. La
comprobación no puede quedarse en "responde `/health`": el backend del programa
principal también responde ahí, y confundirlos mandaría las peticiones al
servicio equivocado. Se distingue por el campo `servicio` del diagnóstico, que
solo expone este API:

```js
const diag = await fetch(`${base}/api/sistema/diagnostico`).then(r => r.json());
if (diag?.servicio === 'seat-api') { /* es este */ }
```

Lo usan `vite.config.ts` (para el proxy) y `npm run puertos`:

```
$ npm run puertos
──────────────────────────────────────────────────────────
  Servicios en marcha en localhost
──────────────────────────────────────────────────────────
  Seat API               http://localhost:5008      v2.0.0 · panel y /api-docs
  App web (Vite)         http://localhost:3001      servidor de desarrollo
  Otra API               http://localhost:5000      BusReservation API
```

### El retorno tras pagar

PayPal devuelve siempre al comprador a `/checkout/retorno` del propio API, cuya
URL es estable, y el API lo reenvía a la aplicación que inició la compra:

```
PayPal  →  {API}/checkout/retorno?token=ORDEN
        →  {origen-de-quien-creó-la-orden}/seat-booking?orden=ORDEN&estado=aprobada
```

El destino se decide al **crear** la orden, por este orden de preferencia:

1. el `returnUrl` que envíe el consumidor,
2. `APP_RETURN_BASE_URL` + `APP_RETURN_PATH`, si están configurados,
3. la cabecera `Origin` de esa petición — **el caso normal**, y lo que elimina
   la configuración de puertos,
4. el panel del propio API, que sabe retomar la captura con esos parámetros.

Lo elegido se guarda en el campo `returnTo` de la orden. Así el retorno vuelve
exactamente a donde empezó la compra, en el puerto que tuviera entonces, incluso
si entretanto se reinició el servidor de desarrollo con otro puerto.

Los dos saltos son deliberados: la `return_url` queda grabada en cada orden de
PayPal, así que apuntarla al API permite cambiar de destino sin invalidar
órdenes ya creadas.

---

## 3. Arquitectura: hexagonal por capas + MVC

### El criterio

La regla que organiza todo el código es una sola: **las dependencias apuntan
hacia dentro**. El dominio no sabe que existe Express, ni PayPal, ni que los
datos viven en un `Map`. Las capas de fuera dependen de las de dentro, nunca al
contrario.

Eso es lo que permite responder "sí" a estas preguntas sin tocar reglas de
negocio:

- ¿Puedo cambiar el almacenamiento en memoria por PostgreSQL? → otro adaptador.
- ¿Puedo cambiar PayPal por Mercado Pago? → otro adaptador.
- ¿Puedo probar el cálculo de precios sin levantar un servidor? → sí, es una
  clase pura.

### Las capas

```
┌─────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE — adaptadores (lo intercambiable)           │
│                                                             │
│   http/          Adaptador de ENTRADA  ← aquí vive el MVC   │
│     controllers/   (C) traducen HTTP ↔ casos de uso         │
│     routes/            definen URLs y documentan            │
│     views/         (V) panel glassmorphism                  │
│     middlewares/       CORS, errores, 404                   │
│   persistence/   Adaptador de SALIDA: repositorios          │
│   payments/      Adaptador de SALIDA: PayPal                │
│   config/        env + contenedor de dependencias           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  APPLICATION — casos de uso (la orquestación)         │  │
│  │                                                       │  │
│  │   Un archivo por operación del negocio. Reciben sus   │  │
│  │   dependencias ya construidas y coordinan el flujo.   │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  DOMAIN — el núcleo (lo que no cambia)          │  │  │
│  │  │                                                 │  │  │
│  │  │   model/     (M) entidades y objetos de valor   │  │  │
│  │  │   services/      reglas puras (precios, bus)    │  │  │
│  │  │   ports/         interfaces hacia el exterior   │  │  │
│  │  │   errors/        errores con código semántico   │  │  │
│  │  │                                                 │  │  │
│  │  │   Cero dependencias externas.                   │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Dónde encaja el MVC

MVC no sustituye a la arquitectura hexagonal: vive **dentro del adaptador de
entrada HTTP**. Es la forma que toma el hexágono por el lado que da a la web.

| Letra | Dónde está | Responsabilidad |
|---|---|---|
| **Model** | `domain/model/` + `domain/services/` | Entidades (`Seat`, `Hold`, `Reservation`, `PaymentOrder`, `Money`) y reglas (`PricingPolicy`, `SeatLayout`). |
| **View** | `infrastructure/http/views/` | El panel glassmorphism que sirve el API en `/`. |
| **Controller** | `infrastructure/http/controllers/` | Leen la petición, llaman a un caso de uso, formatean la respuesta. Nada más. |

Un controlador correcto en este proyecto se ve así — no hay lógica, solo
traducción:

```js
viewModel = (req, res, next) => {
  try {
    const result = this.useCases.getSeatViewModel.execute({
      rutaId: req.query.rutaId,
      fecha: req.query.fecha,
      userId: req.query.userId ?? null,
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);   // errorHandler traduce el error de dominio a status HTTP
  }
};
```

Si en un controlador aparece un cálculo de precio o una comprobación de
disponibilidad, está en la capa equivocada.

### Árbol de archivos

```
seat-api/
├── api/
│   └── index.js                      ← entrada Vercel (exporta, NO escucha)
├── vercel.json                       ← configuración del despliegue
├── package.json
├── .env.example                      ← plantilla (el .env real no se versiona)
├── scripts/
│   └── smoke-test.js                 ← 30 comprobaciones del flujo completo
└── src/
    ├── server.js                     ← entrada local/Render (escucha el puerto)
    │
    ├── domain/                       ── NÚCLEO (sin dependencias externas)
    │   ├── model/
    │   │   ├── Seat.js                  estados interno y de interfaz
    │   │   ├── Hold.js                  bloqueo temporal, sabe si expiró
    │   │   ├── Reservation.js           reserva definitiva
    │   │   ├── PaymentOrder.js          ciclo de vida del pago + historial
    │   │   └── Money.js                 importes y conversión de moneda
    │   ├── services/
    │   │   ├── PricingPolicy.js         descuentos por volumen
    │   │   └── SeatLayout.js            distribución 2+pasillo+2
    │   ├── ports/
    │   │   ├── SeatRepositoryPort.js    contrato de persistencia de asientos
    │   │   ├── OrderRepositoryPort.js   contrato de persistencia de órdenes
    │   │   ├── PaymentGatewayPort.js    contrato de pasarela de pagos
    │   │   └── ClockPort.js             el reloj, inyectable para pruebas
    │   └── errors/
    │       └── DomainError.js           Validation / NotFound / Conflict / Gateway
    │
    ├── application/                  ── CASOS DE USO
    │   └── use-cases/
    │       ├── GetSeatAvailability.js   contrato original de /disponibles
    │       ├── GetSeatViewModel.js      mapa unificado para la interfaz
    │       ├── HoldSeats.js             bloqueo todo-o-nada
    │       ├── ReleaseHold.js           liberación idempotente
    │       ├── ListHolds.js             bloqueos activos
    │       ├── ConfirmReservation.js    hold → reserva
    │       ├── CalculatePrice.js        cotización
    │       ├── CreateCheckoutOrder.js   ① orquestación: crear orden
    │       ├── CaptureCheckoutOrder.js  ② orquestación: cobrar y reservar
    │       ├── GetCheckoutOrder.js      consulta y reconciliación
    │       └── HandlePaymentWebhook.js  red de seguridad asíncrona
    │
    └── infrastructure/               ── ADAPTADORES
        ├── config/
        │   ├── env.js                   variables con valores por defecto
        │   └── container.js             ← raíz de composición (el cableado)
        ├── persistence/
        │   ├── InMemorySeatRepository.js
        │   └── InMemoryOrderRepository.js
        ├── payments/
        │   └── PayPalPaymentGateway.js  portado del proyecto de entrenamiento
        └── http/
            ├── app.js                   fábrica de la app Express
            ├── swagger.js               OpenAPI desde los comentarios
            ├── controllers/             asientos · checkout · sistema
            ├── routes/                  asientos · checkout
            ├── middlewares/             CORS · errores
            └── views/
                ├── styles.js            CSS del cristal
                ├── dashboard.view.js    marcado del panel
                └── dashboard.client.js  script del panel
```

### La raíz de composición

`infrastructure/config/container.js` es el único archivo del proyecto donde se
eligen implementaciones concretas. Ningún caso de uso hace `new` de un
adaptador; los recibe construidos.

```js
const seatRepository = new InMemorySeatRepository();   // ← cambiar aquí
const paymentGateway = new PayPalPaymentGateway({...}); // ← y aquí

const useCases = {
  holdSeats: new HoldSeats({ seatRepository, seatLayout, pricingPolicy, clock, holdTtlMs }),
  // ...
};
```

Migrar a PostgreSQL es escribir `PostgresSeatRepository extends SeatRepositoryPort`
y cambiar una línea de este archivo. Los casos de uso no se enteran.

---

## 4. La orquestación con PayPal

### De dónde viene

El adaptador `PayPalPaymentGateway.js` es un porte del proyecto
`EntrenamientoPasarelaDePagoSANDBOX-master` (TypeScript) a este API, conservando
las mismas credenciales y el mismo comportamiento. Se añadieron dos cosas que
faltaban:

- **Cabecera `PayPal-Request-Id`** en crear y capturar. Sin ella, un reintento
  por corte de red puede generar una orden duplicada o un doble cobro.
- **Traducción de errores**: los fallos de PayPal se convierten en
  `GatewayError` del dominio, de modo que los casos de uso no manipulan códigos
  HTTP ajenos.

El proyecto de entrenamiento sigue siendo válido por su cuenta (tiene su tienda
demo y su panel de administración). La diferencia es que **el programa principal
ya no necesita hablar con dos APIs**: el Seat API orquesta el pago y devuelve
asientos reservados.

### El flujo completo

```
PROGRAMA PRINCIPAL          SEAT API                        PAYPAL
       │                       │                               │
       │ ① POST /asientos/reservar                             │
       │   {rutaId, fecha, asientos:[5,6,7], userId}           │
       ├──────────────────────►│                               │
       │                       │ valida el bus, crea los holds │
       │   {holdIds, pricing}  │ (todo-o-nada)                 │
       │◄──────────────────────┤                               │
       │                       │                               │
       │ ② POST /checkout/crear-orden                          │
       │   {holdIds, userId}        ← SIN importe              │
       ├──────────────────────►│                               │
       │                       │ verifica cada hold:           │
       │                       │  existe · vigente · es tuyo   │
       │                       │ cotiza con PricingPolicy      │
       │                       │ convierte COP → USD           │
       │                       ├──── POST /v2/checkout/orders ►│
       │                       │◄──── {id, links.approve} ─────┤
       │                       │ guarda orden ↔ holdIds        │
       │  {orderId, approvalUrl}│                              │
       │◄──────────────────────┤                               │
       │                       │                               │
       │ ③ el comprador aprueba en PayPal ────────────────────►│
       │                       │                               │
       │ ④ POST /checkout/capturar-orden                       │
       │   {orderId}           │                               │
       ├──────────────────────►│                               │
       │                       ├─ POST /orders/{id}/capture ──►│
       │                       │◄──── {status: COMPLETED} ─────┤
       │                       │ holds → reservas definitivas  │
       │  {reservas, captureId}│                               │
       │◄──────────────────────┤                               │
       │                       │                               │
       │        (en paralelo, si el navegador se cerró)         │
       │                       │◄──── webhook ─────────────────┤
       │                       │ captura y reserva igual        │
```

### Las cuatro decisiones que importan

**1. El importe nunca viene del cliente.**

`POST /checkout/crear-orden` recibe `holdIds`, no un total. El precio se
recalcula en el servidor a partir de los bloqueos verificados, usando la misma
`PricingPolicy` que alimenta `/calcular-precio`. Si el navegador pudiera enviar
el total, cualquiera pagaría un peso por cinco asientos.

**2. Primero se cobra, después se reserva.**

Al revés quedarían asientos vendidos sin cobro cuando PayPal rechaza la captura.

Eso abre el caso incómodo de *"cobrado, pero el bloqueo expiró mientras el
comprador estaba en PayPal"*. Perder el asiento en silencio sería lo peor
posible, así que `CaptureCheckoutOrder` hace esto:

| Situación tras cobrar | Qué ocurre |
|---|---|
| El bloqueo sigue vigente | Se confirma la reserva normalmente. |
| El bloqueo expiró pero el asiento sigue libre | **Se reserva igual.** El pago fue válido. La respuesta lo indica en `reservas[].nota`. |
| El bloqueo expiró y otro comprador tomó el asiento | Se devuelve `requiereAtencion: true` con el `captureId` a la vista para gestionar la devolución. |

**3. La captura es idempotente.**

PayPal reintenta, y el comprador recarga la página. Repetir la llamada sobre una
orden ya pagada devuelve el mismo resultado con `yaProcesada: true`, sin cobrar
dos veces ni duplicar reservas. Además el adaptador envía
`PayPal-Request-Id: capture-{orderId}`, de modo que la protección existe también
del lado de PayPal.

**4. El webhook es la red de seguridad, no el camino principal.**

Si el comprador aprueba y cierra el navegador antes de que el frontend llame a
capturar, llega `CHECKOUT.ORDER.APPROVED` y el API captura por su cuenta. El
endpoint responde `200` siempre salvo firma inválida: devolver un error hace que
PayPal reintente el mismo evento durante días.

### La moneda: USD nativo, sin conversión

El negocio opera en **Ecuador, cuya moneda es el dólar**, y se comprobó contra
la API de PayPal que la cuenta de negocio tiene saldo **únicamente en USD**:

```
GET /v1/reporting/balances?currency_code=ALL
→ { "balances": [ { "currency": "USD", ... } ], "account_id": "CUQ2ZHR4YGR7Q" }
```

Por eso la configuración cotiza y cobra en la misma moneda:

```env
BASE_PRICE=12.50
PRICE_CURRENCY=USD
PAYMENT_CURRENCY=USD
PAYMENT_FX_RATE=1        # misma moneda → no hay conversión
```

La versión anterior asumía pesos colombianos (`BASE_PRICE=50000`,
`PRICE_CURRENCY=COP`, tasa 4000). Eso metía una conversión que aquí no hace
falta, producía importes que no cuadraban con lo que se cobra y obligaba a
mirar dos cifras para entender un precio.

El cambio obligó a corregir algo que estaba mal de base: **los importes se
redondeaban siempre a entero**, lo que convertía 12,50 USD en 13. Ahora la
precisión la decide la moneda (`domain/model/Currency.js` la consulta a `Intl`),
porque el dólar lleva centavos y el peso colombiano no.

Dos sitios donde eso importa y antes fallaba:

- **Al aplicar un descuento:** el 7 % de 37,50 USD es 2,625, que con tres
  decimales PayPal rechaza. Se redondea a la precisión de la moneda en cada paso.
- **Al sumar en los informes:** acumular decimales en coma flotante da
  residuos — `34.87 + 23.75 + 12.50` puede dar `71.12000000000001` — y eso
  acabaría impreso en el tablero.

Si algún día se cotiza en una moneda que PayPal no soporta, la conversión sigue
estando: basta poner `PRICE_CURRENCY=COP` y `PAYMENT_FX_RATE=4000`. El arranque
avisa si las monedas difieren y la tasa es 1, que significaría cobrar el importe
sin convertir.

### Cómo se conserva la conversión

La conversión vive en el objeto de valor `Money` del dominio, porque es una
regla de negocio y no un detalle de transporte. Con la configuración actual es
la identidad:

```
12,50 USD × 3 asientos  = 37,50
−7 % (descuento por 3)  = 34,87 USD   ← lo que se cobra, sin convertir
```

Y si se cotizara en otra moneda, el mismo código la aplicaría:

```
50 000 COP × 3 asientos   = 150 000
−7 %                      = 139 500 COP
÷ 4 000 (PAYMENT_FX_RATE) =   34,88 USD
```

Ambas cifras viajan siempre en la respuesta (`pricing` y `cobro`), aunque
coincidan, para que la interfaz no tenga que saber si hay conversión o no.

---

## 5. Contrato del API

Documentación interactiva: **`/api-docs`** · JSON OpenAPI: **`/api-docs.json`**

### Asientos

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/asientos/view-model` | **Recomendado.** Mapa completo para la interfaz en una sola llamada. |
| `GET` | `/api/asientos/disponibles` | Contrato original, se mantiene por compatibilidad. |
| `POST` | `/api/asientos/reservar` | Bloquear uno o varios asientos. |
| `GET` | `/api/asientos/holds` | Listar bloqueos activos. |
| `DELETE` | `/api/asientos/holds` | Liberar bloqueos (idempotente). |
| `POST` | `/api/asientos/reservar-definitivo` | Confirmar sin pago en línea (taquilla). |
| `POST` | `/calcular-precio` | Cotizar N asientos. |

### Checkout

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/checkout/configuracion` | `clientId` y modo, para cargar el SDK en el navegador. |
| `POST` | `/api/checkout/crear-orden` | ① Crear la orden de pago. |
| `POST` | `/api/checkout/capturar-orden` | ② Cobrar y confirmar los asientos. |
| `GET` | `/api/checkout/orden/:orderId` | Consultar estado (añade `?paypal=true` para contrastar). |
| `POST` | `/api/checkout/webhook` | Receptor de notificaciones de PayPal. |

### Reportes (tablero gerencial)

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/api/reportes/kpis` | Solo los indicadores, para las tarjetas de un panel que refresca a menudo. |
| `GET` | `/api/reportes/resumen` | Informe completo: ingresos, embudo, ocupación, descuentos por tramo, desgloses e incidencias. |

| `GET` | `/api/reportes/cuenta-pasarela` | Cuenta de negocio en PayPal: saldo, movimientos y comisiones. |

Los dos primeros aceptan `desde`, `hasta` (inclusivo), `rutaId` y `fecha`.

`cuenta-pasarela` mide algo **distinto** del informe de ventas: ahí está lo
facturado, aquí lo que realmente entró en la cuenta. No coinciden, porque PayPal
cobra comisión por operación y retiene temporalmente una parte del saldo. En la
cuenta real: 5 123,54 USD de saldo con 44,34 retenidos, y 8,96 de comisiones en
16 movimientos.

Dos criterios que conviene conocer antes de usar estas cifras:

- **Solo las órdenes pagadas cuentan como ingreso.** Las pendientes son
  intención de compra; aparecen en `ordenes.valorPendiente` y en la tasa de
  conversión, nunca sumadas al ingreso.
- **El cobro en pasarela se suma desde cada orden**, no convirtiendo el total:
  los redondeos a dos decimales de cada cobro no coinciden con el redondeo de
  la suma.

> **Alcance:** reflejan lo que conoce este API, cuyo almacenamiento es en
> memoria. Son una vista **operativa en vivo**, no un histórico. El registro
> definitivo de las ventas debe vivir en la base de datos del programa
> principal — ver [`PROMPT-DASHBOARD-GERENCIAL.md`](PROMPT-DASHBOARD-GERENCIAL.md)
> y [§13](#13-limitaciones-conocidas).

### Sistema

| Método | Ruta | Para qué |
|---|---|---|
| `GET` | `/` | Panel glassmorphism. |
| `GET` | `/health` | Comprobación de salud. |
| `GET` | `/api/sistema/diagnostico` | Estado completo del despliegue. |
| `GET` | `/api/sistema/paypal` | Verifica las credenciales pidiendo un token real. |

### Estados de un asiento

`view-model` devuelve etiquetas pensadas para la interfaz:

| Estado | Significado | Se puede seleccionar |
|---|---|---|
| `disponible` | Libre | Sí |
| `miHold` | Bloqueado por el `userId` de la consulta | Ya es tuyo |
| `en_hold` | Bloqueado por otro comprador | No |
| `ocupado` | Reserva confirmada y pagada | No |

El `holdId` **solo se revela a su dueño**. Antes se devolvía a cualquiera, lo
que permitía liberar el asiento de otro comprador conociendo su identificador.
`ReleaseHold` comprueba además la propiedad cuando se le envía `userId`.

### Forma de los errores

Todas las respuestas de error comparten estructura, y el `code` es estable
(el texto de `error` puede cambiar):

```json
{
  "ok": false,
  "error": "Uno de los bloqueos expiró; vuelve a seleccionar los asientos",
  "code": "CONFLICT",
  "details": { "holdId": "hold_1760..." }
}
```

| `code` | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Datos inválidos o reglas de negocio incumplidas |
| `NOT_FOUND` | 404 | El bloqueo o la orden no existe |
| `CONFLICT` | 409 | Asiento tomado, bloqueo expirado, orden en estado incorrecto |
| `GATEWAY_ERROR` | 502 | PayPal no responde o rechaza |
| `CORS_BLOCKED` | 403 | Origen no permitido |
| `INTERNAL_ERROR` | 500 | Fallo no previsto |

---

## 6. Cómo consumirlo desde el programa principal

### Estado actual de la integración

El programa principal es `C:\Repositorios\CulturalTrip`:

| Pieza | Puerto | Qué es |
|---|---|---|
| `frontend/` | **3001** | Vite + React. Configurado en el 3000, arranca en el 3001 porque el 3000 está ocupado. |
| `backend/` | 5000 | `BusReservation API`, el backend propio del sistema. |

Su `frontend/src/services/asientosService.js` ya consume este API:

```js
const SEAT_API_BASE_URL = (import.meta.env.VITE_SEAT_API_URL || '/api/asientos').replace(/\/$/, '');
await axios.get(`${SEAT_API_BASE_URL}/disponibles`, { params: { rutaId, fecha } });
```

Con `VITE_SEAT_API_URL=https://apiconsumidorac.vercel.app/api/asientos`, las
rutas que construye (`/disponibles`, `/reservar`, `/holds`) **coinciden con las
de este API**, así que funciona sin cambios una vez desplegado como se describe
en [§8](#8-despliegue-en-vercel).

Dos cosas conviene revisar en ese servicio:

1. **El *fallback* silencioso.** Ante un `404` o un *timeout* devuelve una lista
   de asientos inventada con `_isFallback: true`. Es lo que hacía que el API
   caída pareciera funcionar. Para una demostración puede valer, pero conviene
   que la interfaz muestre que los datos no son reales.
2. **No usa el flujo de pago.** Llama a `/disponibles`, `/reservar` y `/holds`,
   pero no a `/api/checkout/*`. Para cobrar hay que añadir los pasos ② y ④ que
   se describen abajo.

### Flujo mínimo completo

```js
const API = process.env.SEAT_API_URL; // https://tu-seat-api.vercel.app

// ① Bloquear los asientos elegidos
const hold = await fetch(`${API}/api/asientos/reservar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rutaId: '123',
    fecha: '2026-10-20',
    asientos: [5, 6, 7],        // o `asiento: 5` para uno solo
    userId: usuarioActual.id,
    companyName: 'Viajes Nova S.A.', // obligatorio desde 5 asientos
  }),
}).then((r) => r.json());

// hold.holdIds → ["hold_...", "hold_...", "hold_..."]
// hold.pricing → desglose con descuento ya aplicado
// hold.ttlMs   → milisegundos antes de que expiren

// ② Crear la orden de pago (sin enviar importe)
const orden = await fetch(`${API}/api/checkout/crear-orden`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    holdIds: hold.holdIds,
    userId: usuarioActual.id,
    returnUrl: 'https://mi-app.com/pago/exito',
    cancelUrl: 'https://mi-app.com/pago/cancelado',
  }),
}).then((r) => r.json());

// ③ Llevar al comprador a orden.approvalUrl
//    (o usar el SDK de PayPal con orden.orderId)

// ④ Al volver, capturar: cobra y confirma los asientos
const pago = await fetch(`${API}/api/checkout/capturar-orden`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId: orden.orderId, userId: usuarioActual.id }),
}).then((r) => r.json());

if (pago.requiereAtencion) {
  // Cobrado, pero algún asiento se perdió. Hay que devolver.
  // pago.captureId y pago.conflictos traen todo lo necesario.
}
```

### Con los botones del SDK de PayPal

La orden se crea **en el servidor** y al navegador solo se le pasa su `id`, de
modo que el importe nunca se decide en el cliente:

```js
const { clientId, pasarela } = await fetch(`${API}/api/checkout/configuracion`)
  .then((r) => r.json());

// <script src="https://www.paypal.com/sdk/js?client-id={clientId}&currency=USD">

paypal.Buttons({
  createOrder: () => orderIdCreadoEnElServidor,
  onApprove: () => fetch(`${API}/api/checkout/capturar-orden`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: orderIdCreadoEnElServidor }),
  }).then((r) => r.json()),
}).render('#paypal-buttons');
```

### Pintar el mapa de asientos

Una sola llamada; conviene repetirla cada 10–15 s para reflejar lo que hacen
otros compradores:

```js
const q = new URLSearchParams({ rutaId: '123', fecha: '2026-10-20', userId: usuarioActual.id });
const vm = await fetch(`${API}/api/asientos/view-model?${q}`).then((r) => r.json());

// vm.asientos  → [{ numero, estado, posicion, holdId, expiresAt, remainingMs }]
// vm.resumen   → { disponibles, enHold, miHold, ocupados }
// vm.precios   → precio unitario, máximo, umbral corporativo
```

### Al abandonar el carrito

Conviene liberar los bloqueos en lugar de esperar los 10 minutos:

```js
await fetch(`${API}/api/asientos/holds`, {
  method: 'DELETE',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ holdIds: hold.holdIds, userId: usuarioActual.id }),
});
```

### Lo que hay que registrar en el programa principal

El Seat API guarda su estado **en memoria** (ver limitaciones). El sistema
principal debería persistir, al capturar el pago:

- `orderId` y `captureId` de PayPal (comprobante del cobro)
- `rutaId`, `fecha` y los números de asiento reservados
- el `pricing` devuelto (cantidad, descuento, total)
- el `userId` del comprador

Con eso la venta queda registrada en la base de datos del sistema principal
aunque el API de asientos se reinicie.

---

## 7. Configuración

Plantilla completa en `seat-api/.env.example`.

### Para desarrollar en local: solo dos variables

```env
PAYPAL_CLIENT_ID=<tu client id de sandbox>
PAYPAL_CLIENT_SECRET=<tu secret de sandbox>
```

El resto tiene valores por defecto que funcionan, y las tres que antes había que
mantener a mano ya no hacen falta ([§2bis](#2bis-nada-de-puertos-fijos)):

| Variable | En local | Por qué ya no se toca |
|---|---|---|
| `ALLOWED_ORIGINS` | déjala vacía | Fuera de producción se acepta cualquier puerto de localhost |
| `APP_RETURN_BASE_URL` | déjala vacía | El destino del retorno se deduce del origen de cada orden |
| `VITE_SEAT_API_URL` (frontend) | déjala vacía | El proxy de Vite descubre el puerto del API al arrancar |

### Todas las variables

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | `5008` | Puerto de partida. Si está ocupado se prueba el siguiente. Lo ignora Vercel |
| `NODE_ENV` | `development` | Fuera de `production`, CORS acepta cualquier puerto de localhost |
| `ALLOWED_ORIGINS` | — | Orígenes permitidos, separados por coma. Admite `https://*.vercel.app`. **Obligatoria en producción** |
| `PUBLIC_BASE_URL` | autodetectada | En Vercel se deduce de `VERCEL_URL` |
| `APP_RETURN_BASE_URL` | — | Fuerza un destino fijo para el retorno. Vacío = se deduce del origen de cada orden |
| `APP_RETURN_PATH` | `/seat-booking` | Ruta dentro de esa aplicación |
| `SEAT_HOLD_TTL_MS` | `600000` | Duración de un bloqueo (10 min) |
| `TOTAL_SEATS` | `40` | Asientos por bus |
| `BASE_PRICE` | `12.50` | Precio unitario, con decimales |
| `PRICE_CURRENCY` | `USD` | Moneda del negocio (Ecuador usa USD) |
| `MAX_SEATS_PER_BOOKING` | `10` | Máximo por reserva |
| `CORPORATE_DISCOUNT_FROM` | `5` | Desde aquí se exige razón social |
| `PAYPAL_CLIENT_ID` | — | Credencial de sandbox (pública) |
| `PAYPAL_CLIENT_SECRET` | — | Credencial de sandbox (**secreto**) |
| `PAYPAL_MODE` | `sandbox` | `sandbox` o `live` |
| `PAYPAL_WEBHOOK_ID` | — | Necesario para verificar la firma del webhook |
| `PAYMENT_CURRENCY` | `USD` | Moneda con la que se cobra |
| `PAYMENT_FX_RATE` | `1` | Unidades de PRICE_CURRENCY por 1 de PAYMENT_CURRENCY. Con 1 y la misma moneda, no hay conversión |

Sin credenciales de PayPal el API **arranca igual**: los endpoints de asientos
funcionan y los de checkout devuelven `502` explicando qué falta. Se decidió así
para que un error de configuración de pagos no tumbe la venta en taquilla.

En producción `ALLOWED_ORIGINS` **sí** es obligatoria: ahí la puerta de
localhost está cerrada y, sin lista, el navegador recibirá `403`. El arranque
avisa de ello.

### Tabla de descuentos

| Asientos | Descuento | Total (USD) |
|---|---|---|
| 1 | — | 12.50 |
| 2 | 5 % | 23.75 |
| 3 | 7 % | 34.87 |
| 4 | 10 % | 45.00 |
| 5 o más | 20 % | 50.00 |

Los tramos se definen en `container.js` (`discountTiers`). `PricingPolicy` elige
siempre el tramo más alto que la cantidad alcanza, así añadir uno nuevo no
obliga a reescribir condicionales.

---

## 8. Despliegue en Vercel

> **Recomendado: un solo proyecto.** La raíz del repositorio sirve el frontend
> y el API a la vez, de modo que el programa principal sigue funcionando con la
> `VITE_SEAT_API_URL` que ya tiene configurada.

### Un solo proyecto (recomendado)

1. En el proyecto de Vercel existente, **Root Directory: `/`** (la raíz) y
   Framework **Vite**.
2. Variables de entorno (Settings → Environment Variables):

   ```
   NODE_ENV=production
   ALLOWED_ORIGINS=https://apiconsumidorac.vercel.app,http://localhost:3001
   APP_RETURN_BASE_URL=https://apiconsumidorac.vercel.app
   APP_RETURN_PATH=/seat-booking
   VITE_SEAT_API_URL=https://apiconsumidorac.vercel.app

   PAYPAL_CLIENT_ID=<tu client id de sandbox>
   PAYPAL_CLIENT_SECRET=<tu secret de sandbox>
   PAYPAL_MODE=sandbox
   PAYPAL_WEBHOOK_ID=<opcional, para verificar webhooks>

   BASE_PRICE=50000
   PRICE_CURRENCY=COP
   PAYMENT_CURRENCY=USD
   PAYMENT_FX_RATE=4000
   ```

   `PORT` y `PUBLIC_BASE_URL` no hacen falta: se deducen solas.

   `APP_RETURN_BASE_URL` apunta al dominio del **programa principal** cuando lo
   despliegues; mientras trabajes en local, déjalo en `http://localhost:3001`.

3. **Deploy**. Queda así:

   | URL | Qué responde |
   |---|---|
   | `/` | Frontend de compra |
   | `/api/asientos/...` | Seat API ← lo que consume el programa principal |
   | `/api/checkout/...` | Pasarela PayPal |
   | `/api-docs` | Documentación Swagger |
   | `/health` | Comprobación de salud |

   El panel de diagnóstico del API no está en `/` de este despliegue, porque esa
   ruta la ocupa el frontend. Está disponible desplegando `seat-api/` como
   proyecto aparte, o en local en `http://localhost:5008/`.

### Alternativa: el API como proyecto independiente

`seat-api/` conserva su propio `vercel.json`, así que puede desplegarse solo:
**New Project** → mismo repositorio → **Root Directory `seat-api`** → Framework
**Other**. En ese despliegue `/` sí muestra el panel de diagnóstico.

Si eliges esta vía, hay que actualizar `VITE_SEAT_API_URL` en el programa
principal a `https://<nuevo-proyecto>.vercel.app/api/asientos`.

### Comprobación del despliegue

```bash
# Lo que consume el programa principal — esto es lo que devolvía 404
curl "https://apiconsumidorac.vercel.app/api/asientos/disponibles?rutaId=123&fecha=2026-10-20"
# {"ok":true,"rutaId":"123",...,"total":40}

curl https://apiconsumidorac.vercel.app/health
# {"ok":true,"status":"UP","timestamp":"..."}

curl https://apiconsumidorac.vercel.app/api/sistema/paypal
# {"ok":true,"conectado":true,"mensaje":"Autenticación correcta con PayPal (sandbox)",...}
```

Si `/api/sistema/paypal` responde `502`, las credenciales no están bien puestas
en Vercel. Ese endpoint pide un token OAuth2 **real**, así que distingue
"las variables están configuradas" de "las credenciales funcionan".

### El webhook

En [developer.paypal.com](https://developer.paypal.com/dashboard/applications/sandbox),
dentro de tu app sandbox, añadir un webhook apuntando a:

```
https://apiconsumidorac.vercel.app/api/checkout/webhook
```

Eventos a suscribir: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`,
`PAYMENT.CAPTURE.DENIED`. Copiar el **Webhook ID** que genera PayPal a la
variable `PAYPAL_WEBHOOK_ID`.

Sin ese id los webhooks **se aceptan sin verificar la firma**. Es tolerable en
sandbox; en producción permitiría a cualquiera fingir un pago.

---

## 9. El panel glassmorphism

Servido por el propio API en `/`. Cumple dos funciones:

**Confirmar el despliegue.** Cuatro tarjetas de cristal muestran lo que
respondió el servidor en vivo: versión de Node, plataforma detectada, URL
pública, orígenes CORS, estado real de PayPal con su latencia, configuración de
precios e inventario actual.

**Demostrar el flujo completo** sin Postman y sin el frontend: cargar el mapa de
asientos, seleccionar, bloquear, crear la orden, pagar con los botones de PayPal
y ver los asientos pasar a *ocupado*. La lista de pasos de la derecha se va
marcando conforme avanza.

### Cómo está hecho

El efecto cristal necesita tres cosas **a la vez**; quitando cualquiera, los
paneles se ven como tarjetas grises:

1. Un fondo con color que se transparente — manchas `radial-gradient`
   difuminadas en un pseudo-elemento `fixed`, para que el blur tenga algo que
   difuminar al desplazar la página.
2. `backdrop-filter: blur(22px) saturate(150%)` sobre los paneles.
3. Un borde claro de 1px que simule el canto del cristal.

Detalles de implementación:

- **Sin archivos estáticos.** La vista se genera como cadena desde
  `views/dashboard.view.js`. En una función serverless no se puede confiar en
  leer archivos del disco, y esto elimina la causa más común de 404 en Vercel.
- **Sin dependencias ni build.** Lo que se escribe en `dashboard.client.js` es
  exactamente lo que ejecuta el navegador. El único recurso externo es el SDK de
  PayPal, y solo cuando hay una orden que pagar.
- **Tema claro y oscuro.** El cristal necesita menos transparencia sobre fondo
  claro: un blanco al 7 % desaparece. Hay un juego de variables por tema, y se
  respeta `prefers-color-scheme`.
- **Degradación elegante.** Un bloque `@supports not (backdrop-filter)` sube la
  opacidad de los paneles para que el texto no quede ilegible sobre las manchas
  de color. También se respeta `prefers-reduced-motion`.
- **Accesibilidad.** Los asientos son `<button>` reales con `aria-pressed`,
  los mensajes usan `aria-live`, y hay `:focus-visible` en todo lo interactivo.

El precio que muestra el panel lo calcula **el servidor** (`/calcular-precio`),
no el navegador. Así el panel enseña exactamente lo que se va a cobrar, sin
duplicar la regla de descuentos en el cliente.

---

## 10. El frontend

El frontend de la raíz se reconstruyó por completo. El anterior tenía dos
problemas distintos: se veía básico, y **no podía comprar** — solo bloqueaba
asientos y ahí se quedaba.

### Qué estaba mal

| Problema | Consecuencia |
|---|---|
| **Tailwind y CSS suelto a la vez** | Dos sistemas compitiendo. Además `SeatPicker.css` ni se importaba: 400 líneas de estilos muertos. |
| **Tabla de descuentos duplicada en el navegador** | El mismo cálculo en dos sitios: tarde o temprano mostraría un precio distinto al que se cobra. |
| **Sin pago** | El botón "Bloquear" era el final del recorrido. |
| **Usaba `/disponibles`** | No distinguía los bloqueos propios de los ajenos, así que el usuario no sabía cuáles eran suyos. |
| **`userId` fijo `"user-app"`** | Todos los visitantes compartían identidad: cualquiera podía liberar los asientos de otro. |
| **Sin temporizador** | Los asientos se liberaban a los 10 minutos sin que nada lo anticipara. |

### Cómo quedó

```
src/
├── types/api.ts          Contratos del API, espejo del backend
├── lib/
│   ├── api.ts            Cliente tipado + ApiError con código estable
│   ├── format.ts         Moneda, cuenta atrás, fechas
│   └── paypal.ts         Carga del SDK (memorizada)
├── hooks/
│   ├── useSeatMap.ts     Carga + sondeo cada 12 s
│   ├── useQuote.ts       Cotización en el servidor
│   ├── useCheckout.ts    Orquestación del pago
│   ├── useCountdown.ts   Temporizador del bloqueo
│   ├── useUserId.ts      Identidad persistida
│   ├── useToasts.ts      Avisos flotantes
│   └── useTheme.ts       Tema claro/oscuro
├── components/           SeatMap · SeatButton · CheckoutPanel · PayPalCheckout
│                         PriceBreakdown · HoldTimer · Stepper · Receipt
│                         TopBar · TripControls · Toasts
└── styles/
    ├── tokens.css        ← el cristal vive aquí y solo aquí
    ├── base.css          Reset, aurora de fondo, grano
    └── components.css    Clases de los componentes
```

La separación es la misma idea que en el API: los `hooks/` concentran el
comportamiento, los `components/` solo presentan, y `lib/api.ts` es el único
sitio que sabe cómo se habla con el servidor.

### Lo que ahora sí funciona

- **Flujo de compra completo**: elegir → bloquear → pagar con PayPal → reserva
  confirmada con comprobante.
- **El precio lo calcula el servidor.** Se eliminó la tabla de descuentos del
  navegador; ahora hay una sola fuente de verdad.
- **Sondeo cada 12 segundos**, en pausa cuando la pestaña no está visible. Si
  otro comprador toma un asiento que tenías marcado, se quita de tu selección y
  te avisa, en lugar de fallar al bloquear.
- **Identidad persistida** en `localStorage`: al recargar, el API sigue
  reconociendo tus bloqueos como propios (`miHold`) y puedes pagarlos o
  liberarlos. Antes recargar los dejaba inaccesibles hasta que expiraran.
- **Cuenta atrás visible** con barra de progreso, que se pone roja en el último
  minuto. Se apoya en la marca de tiempo absoluta del servidor, no en restar un
  segundo por tick, para no desincronizarse si la pestaña queda en segundo plano.
- **Liberación de asientos** al cancelar y también al cerrar la pestaña, vía
  `navigator.sendBeacon`. Para eso se añadió `POST /api/asientos/holds/liberar`,
  porque `sendBeacon` solo puede emitir POST y sin cuerpo JSON.
- **Los campos de ruta y fecha se bloquean** mientras hay asientos retenidos:
  cambiar de viaje dejaría esos bloqueos fuera de la vista.
- **Comprobante** con el `captureId`, y aviso explícito cuando el pago se cobró
  pero algún asiento se perdió.

### El diseño

Mismo lenguaje que el panel del API, con algún refinamiento más:

- **Aurora animada** de fondo (28 s, muy lenta) y una capa de **grano al 3 %**.
  El grano es el detalle que evita que los degradados se vean como bandas lisas
  de CSS.
- **Tres niveles de opacidad de cristal**: los paneles grandes llevan menos velo
  que los controles pequeños, que han de resaltar sobre el panel que los contiene.
- **Sombra interior superior** en cada panel: es lo que da el brillo del canto
  del vidrio. Sin ella parecen rectángulos translúcidos sin volumen.
- **Tema claro de verdad**, no una inversión: sobre fondo claro el cristal pasa
  a ser casi opaco, porque un blanco al 5 % desaparece.
- **El total con degradado recortado al texto**, los asientos con elevación al
  pasar el ratón, y esqueletos con brillo mientras carga.

Accesibilidad: los asientos son `<button>` con `aria-pressed` y etiqueta
descriptiva, los estados llevan además una marca de esquina (`✓` / `✕`) para no
depender solo del color, el temporizador es un `progressbar` que solo se anuncia
en el tramo crítico, y hay `:focus-visible` en todo lo interactivo.

### Lo que sigue pendiente

El `userId` sale del navegador, no de una sesión autenticada: hoy cualquiera
podría declararse otro usuario. Es la misma carencia que tiene el API y está
anotada en la sección de seguridad.

---

## 11. Pruebas

### API

```bash
cd seat-api
npm install
npm run smoke
```

`scripts/smoke-test.js` levanta la app en un puerto libre y recorre el flujo
real, incluida la creación de una orden **de verdad** en PayPal Sandbox. Los
pasos que necesitan credenciales se omiten solos si no las hay.

Estado actual: **30/30 comprobaciones superadas**, con una orden real creada en
sandbox (`34.88 USD` por 3 asientos con 7 % de descuento).

Más allá de comprobar que los endpoints responden, verifica las reglas que no
deben romperse nunca:

- El importe no se puede manipular desde el cliente.
- El bloqueo múltiple es todo-o-nada: cuando falla un asiento, los demás quedan
  libres.
- El `holdId` no se filtra a quien no es su dueño.
- No se puede liberar el bloqueo de otro usuario.
- La liberación es idempotente.
- La captura exige aprobación previa del comprador.
- Ni el diagnóstico ni `/configuracion` filtran el `client secret`.

### Frontend

```bash
npm run check      # tsc estricto + comprobación de renderizado
```

`scripts/render-check.tsx` monta el árbol de componentes con `renderToString` y
falla si algo lanza. Cubre el hueco que dejan las otras comprobaciones:
TypeScript valida los tipos, pero no detecta un acceso a una propiedad de
`undefined` dentro de un componente. Recorre los cuatro estados de asiento, las
cinco fases del flujo, el temporizador normal y urgente, y el comprobante con y
sin incidencias. Estado actual: **15/15**.

### Lo que ninguna de las dos cubre

Los tipos de TypeScript se borran al compilar, así que una respuesta del API con
un campo renombrado pasaría el build y fallaría en el navegador. Durante esta
iteración se validaron los 13 contratos (`ViewModel`, `Quote`, `HoldResult`,
`OrderResult`, `Charge`, `ReleaseResult`, `ApiError`…) campo por campo contra
respuestas reales del servidor. Ese desajuste apareció de verdad: `crear-orden`
devolvía `cobro.value`/`currency_code` —nombres de PayPal— mientras el resto del
API usaba `cobro.valor`/`moneda`. Ya está normalizado.

El único paso que no se puede automatizar es la aprobación del comprador en la
interfaz de PayPal, porque exige iniciar sesión en su web.

---

## 12. Seguridad

### Atender cuanto antes

> **Las credenciales de PayPal estuvieron en archivos `.env` versionados.**
>
> En este repositorio `.env` y `seat-api/.env` estaban **seguidos por git** y
> no figuraban en `.gitignore`. Ya se corrigió: se añadieron al `.gitignore` y
> se sacaron del índice con `git rm --cached` (los archivos locales siguen
> intactos).
>
> Pero el `.env` del proyecto `EntrenamientoPasarelaDePagoSANDBOX-master`
> contiene el `PAYPAL_CLIENT_SECRET` y también las contraseñas de las cuentas
> de sandbox. **Si ese repositorio está publicado en GitHub, esas credenciales
> están expuestas y conviene rotarlas** desde el panel de PayPal Developer
> (Apps & Credentials → tu app → *Generate new secret*). Son de sandbox, así
> que no hay dinero real en riesgo, pero cualquiera podría usar tu aplicación
> de pruebas.
>
> Que un `.env` esté en `.gitignore` hoy no borra lo que ya está en el
> historial: si se llegó a subir, hay que rotar el secreto.

### Lo que ya está resuelto

- **El `client secret` no sale nunca del servidor.** El diagnóstico expone solo
  un prefijo del `client id` (que es público por diseño: el SDK lo necesita), y
  la prueba de humo comprueba que el secret no aparece en ninguna respuesta.
- **El importe se calcula en el servidor.** El cliente solo envía `holdIds`.
- **El `holdId` solo lo ve su dueño**, y liberar un bloqueo ajeno está
  bloqueado.
- **Idempotencia en la captura**, en el API y con `PayPal-Request-Id` del lado
  de PayPal.
- **El detalle de los errores 500 solo se muestra en desarrollo**; en producción
  filtraría rutas internas.

### Pendiente para producción

| Qué falta | Por qué importa |
|---|---|
| **Autenticación** | Hoy cualquiera que conozca la URL puede bloquear asientos. Hace falta un token (JWT) y tomar el `userId` de ahí, no del cuerpo de la petición ni del `localStorage` del navegador. |
| **Límite de peticiones** | Sin él, un script puede bloquear los 40 asientos en un segundo. |
| **`PAYPAL_WEBHOOK_ID`** | Sin él los webhooks se aceptan sin verificar la firma. |
| **Almacenamiento persistente** | Ver la sección siguiente. |

---

## 13. Limitaciones conocidas

### El estado vive en memoria

`InMemorySeatRepository` guarda los bloqueos y las reservas en el proceso. Las
consecuencias son reales y conviene tenerlas claras:

- **En local**, el inventario se pierde al reiniciar.
- **En Vercel**, cada instancia de la función tiene su **propia copia**. Un
  bloqueo creado en una instancia puede no verse en otra, y las instancias
  frías empiezan vacías. Para una demostración funciona; para venta real, no.

Dos salidas, por orden de esfuerzo:

1. **Desplegar en Render** con el `render.yaml` de la raíz. Un solo proceso vivo
   hace el estado consistente, y el API soporta este modo sin cambios.
2. **Escribir un adaptador persistente** (Redis o PostgreSQL) que extienda
   `SeatRepositoryPort` y cambiar una línea en `container.js`. Ninguna regla de
   negocio se entera. Esto es exactamente lo que compra la arquitectura
   hexagonal, y la razón de haberla aplicado.

### Otros puntos

- **La tasa de cambio es fija** (`PAYMENT_FX_RATE`). Para producción habría que
  consultarla a un servicio, lo que encaja como un puerto más del dominio.
- **La purga periódica solo corre con servidor persistente.** No se pierde nada:
  cada caso de uso purga lo que necesita antes de leer el inventario.
- **El token de PayPal se cachea por instancia.** En el peor caso se pide uno
  nuevo; no hay problema de corrección.

---

## 14. Resumen de cambios

### Archivos nuevos

**API**

```
seat-api/api/index.js                  entrada serverless de Vercel
seat-api/vercel.json                   configuración del despliegue
seat-api/scripts/smoke-test.js         30 comprobaciones
seat-api/src/domain/                   11 archivos — núcleo
seat-api/src/application/use-cases/    11 archivos — casos de uso
seat-api/src/infrastructure/           17 archivos — adaptadores
```

**Frontend y despliegue de la raíz**

```
api/index.js                           sirve el Seat API bajo /api del dominio principal
vercel.json                            reparto de rutas: /api → función, resto → frontend
src/types/api.ts                       contratos del API
src/lib/                               cliente HTTP, formato, SDK de PayPal
src/hooks/                             7 hooks con todo el comportamiento
src/components/                        11 componentes
src/styles/                            tokens, base y clases
scripts/ports.mjs (+ .d.mts)           descubrimiento de puertos en localhost
scripts/puertos.mjs                    npm run puertos
scripts/render-check.tsx               15 comprobaciones de renderizado
scripts/run-render-check.mjs           empaquetado para Node
.env.example                           plantilla del frontend
CONTEXTO-PROYECTO.md                   este documento
PROMPT-INTEGRACION.md                  prompt para conectar el programa principal
```

### Archivos reescritos

```
seat-api/src/server.js        solo arranque; ya no construye la app
seat-api/package.json         v2.0.0, Node ≥20, sin la dependencia `uuid`
seat-api/.env.example         plantilla completa documentada
src/App.tsx                   composición; la lógica pasó a los hooks
src/index.css                 importa los tres archivos de estilos
index.html                    en español, con el tema aplicado antes de pintar
package.json                  scripts check, deps del API para la función de /api
postcss.config.js             solo autoprefixer
tsconfig.app.json             incluye scripts/ en el typecheck
.gitignore                    ignora .env y variantes
render.yaml                   un solo archivo correcto, secretos fuera
```

### Correcciones posteriores

```
env.js                        resuelve .env desde su ubicación, no desde el cwd
corsMiddleware.js             fuera de producción se acepta cualquier puerto de localhost
checkout.controller.js        el retorno reenvía al origen guardado en la orden
PaymentOrder.js               campos returnTo y cancelTo por orden
CreateCheckoutOrder.js        deduce el destino del Origin; cobro.valor/moneda
server.js                     busca el siguiente puerto libre si el suyo está ocupado
vite.config.ts                proxy /api con descubrimiento del puerto del API
lib/api.ts                    rutas relativas; VITE_SEAT_API_URL pasa a opcional
PricingPolicy.js              redondea el porcentaje (0.07*100 daba 7.000000000000001)
asientos.controller.js        holdIds por query para navigator.sendBeacon
```

### Archivos eliminados

```
seat-api/src/services/asientos.service.js      → repartido entre domain/ y application/
seat-api/src/controllers/asientos.controller.js→ infrastructure/http/controllers/
seat-api/src/routes/asientos.routes.js         → infrastructure/http/routes/
seat-api/src/components/seatPicker.{tsx,css}   → código de frontend dentro del API
seat-api/FUNCIONES_DESCUENTOS.js               → PricingPolicy en el dominio
seat-api/render.yaml                           → duplicado en conflicto
src/components/SeatPicker.{tsx,css}            → reemplazado por components/ y styles/
src/App.css                                    → styles/base.css
tailwind.config.js                             → competía con el CSS suelto
```

Dependencias retiradas: `uuid` en el API (se usa `randomUUID()` de
`node:crypto`) y `tailwindcss` en el frontend (59 paquetes menos).

### Compatibilidad

Los endpoints que ya existían **mantienen su contrato**. Tres cambios
deliberados:

1. `view-model` ya no devuelve el `holdId` a quien no es su dueño. Para
   recibirlo, hay que enviar el `userId` del propietario. *(seguridad)*
2. `DELETE /holds` comprueba la propiedad cuando se le envía `userId`.
   *(seguridad)*
3. `crear-orden` y `capturar-orden` devuelven `cobro.valor` y `cobro.moneda` en
   lugar de `cobro.value` y `cobro.currency_code`. *(coherencia: los nombres de
   campo de PayPal no deben filtrarse al contrato de esta API)*

---

## 15. Arranque rápido

```bash
# 1. API (primero, para que el frontend la encuentre)
cd seat-api
npm install
cp .env.example .env          # solo hay que poner las credenciales de PayPal
npm run dev

# 2. Frontend (otra terminal, desde la raíz)
npm install
npm run dev                   # no necesita .env: el proxy descubre el API
```

El orden importa solo la primera vez: el proxy del frontend busca el API al
arrancar. Si arrancas el frontend antes, reinícialo después.

```bash
npm run puertos               # ¿en qué puerto quedó cada cosa?
npm run check                 # tsc + 15 comprobaciones de renderizado
cd seat-api && npm run smoke:all  # 30 comprobaciones + informes
```

Los puertos de abajo son los habituales, pero **pueden variar**: si alguno está
ocupado, tanto Vite como el API pasan al siguiente. `npm run puertos` dice
cuáles son en cada momento.

| URL local | Qué es |
|---|---|
| http://localhost:5173/ | **Aplicación de compra** |
| http://localhost:5008/ | Panel de despliegue del API |
| http://localhost:5008/api-docs | Documentación Swagger |
| http://localhost:5008/health | Comprobación de salud |
| http://localhost:5008/api/sistema/diagnostico | Diagnóstico completo |
| http://localhost:5008/api/sistema/paypal | Verifica PayPal de verdad |

### Conectar el programa principal

El prompt listo para pegar en Claude Code dentro de
`C:\Repositorios\CulturalTrip` está en
[`PROMPT-INTEGRACION.md`](PROMPT-INTEGRACION.md).

### Probar el pago de principio a fin

1. Abre http://localhost:5173 y elige asientos.
2. Pulsa **Bloquear y pagar**; arranca la cuenta atrás de 10 minutos.
3. Pulsa el botón de PayPal e inicia sesión con tu cuenta **Personal** de
   sandbox (la que termina en `@personal.example.com`).
4. Aprueba el pago. El frontend captura, los asientos pasan a **Vendido** y
   aparece el comprobante con el `captureId`.

Las cuentas de prueba se gestionan en
[developer.paypal.com/dashboard/accounts](https://developer.paypal.com/dashboard/accounts).
No se mueve dinero real en modo sandbox.
