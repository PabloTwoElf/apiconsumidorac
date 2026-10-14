# CulturalTrip · Seat API

API REST de disponibilidad de asientos con bloqueos temporales (*holds*),
reservas confirmadas y pasarela de pago **PayPal Sandbox** orquestada de extremo
a extremo.

Arquitectura **hexagonal (puertos y adaptadores)** con **MVC** en la capa HTTP.

> El contexto completo del proyecto — diagnóstico del despliegue, decisiones de
> diseño, flujo de pago y limitaciones — está en
> [`../CONTEXTO-PROYECTO.md`](../CONTEXTO-PROYECTO.md).

---

## Arranque

```bash
npm install
cp .env.example .env     # solo hay que rellenar las credenciales de PayPal
npm run dev
```

Arranca en el `PORT` configurado (5008 por defecto) o, si está ocupado, en el
siguiente libre. El arranque imprime el puerto real; desde la raíz del
repositorio, `npm run puertos` también lo dice.

| URL | Qué es |
|---|---|
| `/` | Panel glassmorphism: estado del despliegue y demostración del flujo |
| `/api-docs` | Documentación Swagger interactiva |
| `/health` | Comprobación de salud |
| `/api/sistema/diagnostico` | Estado completo (entorno, precios, inventario, pasarela) |
| `/api/sistema/paypal` | Verifica las credenciales pidiendo un token OAuth2 real |

## Scripts

```bash
npm run dev      # desarrollo con recarga automática
npm start        # producción (servidor persistente)
npm run smoke          # 30 comprobaciones del flujo completo, PayPal incluido
npm run smoke:reportes # informes del tablero gerencial
npm run smoke:all      # las dos
npm run build    # comprueba la sintaxis de los puntos de entrada
```

---

## Estructura

```
api/index.js          ← entrada Vercel: EXPORTA la app, no la escucha
src/server.js         ← entrada local/Render: la escucha en un puerto

src/domain/           Núcleo. Sin dependencias externas.
  model/                Seat · Hold · Reservation · PaymentOrder · Money
  services/             PricingPolicy · SeatLayout
  ports/                contratos hacia persistencia, pagos y reloj
  errors/               errores con código semántico

src/application/      Casos de uso: un archivo por operación del negocio.
  use-cases/

src/infrastructure/   Adaptadores: lo intercambiable.
  config/               env + container.js (la raíz de composición)
  persistence/          InMemorySeatRepository · InMemoryOrderRepository
  payments/             PayPalPaymentGateway
  http/                 ← aquí vive el MVC
    controllers/          (C) traducen HTTP ↔ casos de uso
    routes/                   URLs + anotaciones OpenAPI
    views/                (V) panel glassmorphism
    middlewares/              CORS · errores
```

La regla que organiza todo: **las dependencias apuntan hacia dentro.** El
dominio no sabe que existe Express, ni PayPal, ni que los datos viven en un
`Map`.

Para cambiar de almacenamiento o de pasarela se edita **únicamente**
`src/infrastructure/config/container.js`.

---

## Flujo de compra

```
① POST /api/asientos/reservar        → holdIds
② POST /api/checkout/crear-orden     → orderId + approvalUrl   (sin importe)
③ el comprador aprueba en PayPal
④ POST /api/checkout/capturar-orden  → cobra y confirma los asientos
```

El importe **nunca** viene del cliente: se recalcula en el servidor a partir de
los `holdIds` verificados. El paso ④ es idempotente.

---

## Endpoints

### Asientos

| Método | Ruta |
|---|---|
| `GET` | `/api/asientos/view-model` — **recomendado**, mapa completo en una llamada |
| `GET` | `/api/asientos/disponibles` — contrato original, por compatibilidad |
| `POST` | `/api/asientos/reservar` — bloquear uno o varios asientos |
| `GET` | `/api/asientos/holds` — listar bloqueos activos |
| `DELETE` | `/api/asientos/holds` — liberar (idempotente) |
| `POST` | `/api/asientos/reservar-definitivo` — confirmar sin pago en línea |
| `POST` | `/calcular-precio` — cotizar N asientos |

### Checkout PayPal

| Método | Ruta |
|---|---|
| `GET` | `/api/checkout/configuracion` |
| `POST` | `/api/checkout/crear-orden` |
| `POST` | `/api/checkout/capturar-orden` |
| `GET` | `/api/checkout/orden/:orderId` |
| `POST` | `/api/checkout/webhook` |

### Estados en `view-model`

| Estado | Significado |
|---|---|
| `disponible` | Libre |
| `miHold` | Bloqueado por el `userId` consultado (incluye su `holdId`) |
| `en_hold` | Bloqueado por otro comprador (sin `holdId`) |
| `ocupado` | Reserva confirmada |

---

## Precios

| Asientos | Descuento | Total (COP) | Cobro (USD) |
|---|---|---|---|
| 1 | — | 50 000 | 12.50 |
| 2 | 5 % | 95 000 | 23.75 |
| 3 | 7 % | 139 500 | 34.88 |
| 4 | 10 % | 180 000 | 45.00 |
| 5 o más | 20 % · exige razón social | 200 000 (5) | 50.00 |

El negocio cotiza en COP; PayPal Sandbox no liquida en esa moneda, así que
`Money` convierte con `PAYMENT_FX_RATE` antes de cobrar.

---

## Configuración

Plantilla documentada en [`.env.example`](.env.example). En local solo hacen
falta dos variables:

```env
PAYPAL_CLIENT_ID=<tu client id de sandbox>
PAYPAL_CLIENT_SECRET=<tu secret de sandbox>
```

Las tres que antes había que mantener a mano ya no se tocan:

| Variable | En local | Por qué |
|---|---|---|
| `ALLOWED_ORIGINS` | vacía | Fuera de producción se acepta cualquier puerto de localhost. **Obligatoria en producción** |
| `APP_RETURN_BASE_URL` | vacía | El destino del retorno se deduce del `Origin` de cada orden y se guarda en ella |
| `PORT` | 5008 | Si está ocupado, se usa el siguiente libre |

Sin credenciales de PayPal el API **arranca igual**: los endpoints de asientos
funcionan y los de checkout devuelven `502` explicando qué falta.

---

## Despliegue

**Vercel, recomendado** — el proyecto de la **raíz** del repositorio sirve este
API bajo `/api` del mismo dominio que el frontend (ver `../api/index.js`). Las
variables de entorno se definen ahí, porque es quien ejecuta la función.

**Vercel, proyecto aparte** — también se puede desplegar solo: Root Directory
`seat-api`, framework Other. El `vercel.json` de esta carpeta ya está
configurado y no hace falta paso de build. En ese despliegue `/` muestra el
panel de diagnóstico.

**Render** — usar el `render.yaml` de la raíz del repositorio.

Diferencia importante: en Vercel cada instancia serverless tiene su propia copia
del inventario en memoria. Para que el estado sea consistente hay que usar
Render (un solo proceso) o escribir un adaptador de persistencia real.

Pasos detallados y comprobaciones en
[`../CONTEXTO-PROYECTO.md`](../CONTEXTO-PROYECTO.md).
