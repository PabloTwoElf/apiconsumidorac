# CulturalTrip · Frontend de reserva de asientos

Aplicación Vite + React + TypeScript para elegir asientos de bus y pagarlos con
PayPal Sandbox. Consume el [Seat API](seat-api/) que vive en este mismo
repositorio.

> Contexto completo del proyecto, decisiones de diseño y pasos de despliegue en
> [`CONTEXTO-PROYECTO.md`](CONTEXTO-PROYECTO.md).

---

## Arranque

Primero el API, para que el frontend la encuentre:

```bash
cd seat-api && npm install && npm run dev
```

Y en otra terminal, desde la raíz:

```bash
npm install
npm run dev              # no necesita .env
```

**No hay que configurar ningún puerto.** El proxy de Vite descubre en qué puerto
está el API al arrancar (ver [vite.config.ts](vite.config.ts)), así que el
navegador usa siempre rutas relativas. Si arrancas el frontend antes que el API,
reinícialo después.

## Scripts

```bash
npm run dev            # desarrollo
npm run puertos        # ¿en qué puerto quedó cada servicio?
npm run build          # tsc estricto + build de producción
npm run check          # tsc + comprobación de renderizado
npm run check:render   # monta todos los componentes y falla si alguno lanza
npm run lint
```

`npm run puertos` responde a la pregunta "¿en qué puerto quedó esta vez?":

```
Seat API               http://localhost:5008      v2.0.0 · panel y /api-docs
App web (Vite)         http://localhost:3001      servidor de desarrollo
Otra API               http://localhost:5000      BusReservation API
```

---

## Estructura

```
src/
├── types/api.ts        Contratos del API, espejo del backend
├── lib/
│   ├── api.ts          Cliente tipado; único sitio que habla con el servidor
│   ├── format.ts       Moneda, cuenta atrás, fechas
│   └── paypal.ts       Carga del SDK de PayPal
scripts/
├── ports.mjs           Descubrimiento de puertos (lo usa vite.config.ts)
└── puertos.mjs         npm run puertos
├── hooks/              Todo el comportamiento
│   ├── useSeatMap      carga + sondeo cada 12 s
│   ├── useQuote        cotización en el servidor
│   ├── useCheckout     orquestación del pago
│   ├── useCountdown    temporizador del bloqueo
│   ├── useUserId       identidad persistida
│   ├── useToasts       avisos flotantes
│   └── useTheme        tema claro/oscuro
├── components/         Solo presentación
└── styles/
    ├── tokens.css      ← el cristal vive aquí y solo aquí
    ├── base.css        reset, aurora de fondo, grano
    └── components.css  clases de los componentes
```

El comportamiento está en los hooks y los componentes solo presentan. Para
cambiar el aspecto de toda la aplicación basta editar `styles/tokens.css`.

---

## Flujo de compra

```
① Elegir asientos        toca los libres en el mapa
② Bloquear               POST /api/asientos/reservar → holdIds + cuenta atrás
③ Pagar                  botón de PayPal → POST /api/checkout/crear-orden
④ Confirmar              POST /api/checkout/capturar-orden → comprobante
```

El precio **lo calcula siempre el servidor** (`/calcular-precio`): el navegador
no replica la tabla de descuentos, y al crear la orden solo envía `holdIds`,
nunca un importe.

Los asientos se liberan al cancelar y también al cerrar la pestaña, mediante
`navigator.sendBeacon`.

---

## Detalles que importan

- **Sondeo cada 12 segundos**, en pausa cuando la pestaña no está visible. Si
  otro comprador toma un asiento que tenías marcado, se quita de tu selección
  con un aviso en lugar de fallar al bloquear.
- **La identidad se persiste** en `localStorage`, así que al recargar el API
  sigue reconociendo tus bloqueos como propios y puedes pagarlos o liberarlos.
- **La cuenta atrás usa la marca de tiempo del servidor**, no un contador
  incremental: si la pestaña queda en segundo plano el navegador frena los
  temporizadores y un contador propio se desincronizaría.
- **Accesibilidad**: los asientos son `<button>` con `aria-pressed` y etiqueta
  descriptiva, los estados llevan además una marca de esquina para no depender
  solo del color, y hay `:focus-visible` en todo lo interactivo.

---

## Configuración

En local no hace falta ninguna. La única variable existe para casos concretos:

| Variable | Para qué |
|---|---|
| `VITE_SEAT_API_URL` | **Opcional.** Apunta a un API remota desde una instalación local. Vacía = mismo origen, que es lo correcto tanto en desarrollo (vía proxy) como en producción (vía `api/index.js`). |

Solo las variables con prefijo `VITE_` llegan al navegador, y van **embebidas en
el bundle**: nunca pongas un secreto ahí.

---

## Despliegue

Un solo proyecto de Vercel sirve las dos cosas, con **Root Directory `/`** y
framework **Vite**:

```
https://tu-dominio.vercel.app/          → este frontend
https://tu-dominio.vercel.app/api/...   → Seat API (vía api/index.js)
```

El reparto está en [vercel.json](vercel.json). Al compartir origen no hay CORS
que configurar, y el programa principal puede consumir
`https://tu-dominio.vercel.app/api/asientos/...` sin más.

Las variables de entorno del API (credenciales de PayPal, `ALLOWED_ORIGINS`…) se
definen en **este mismo proyecto** de Vercel, porque es quien ejecuta la función.
Pasos detallados en [`CONTEXTO-PROYECTO.md`](CONTEXTO-PROYECTO.md).

---

## Conectar el programa principal

El prompt listo para pegar en Claude Code está en
[`PROMPT-INTEGRACION.md`](PROMPT-INTEGRACION.md).
