# Prompt para los pagos en el dashboard gerencial

Pega el bloque de abajo en Claude Code **dentro de `C:\Repositorios\CulturalTrip`**.

Antes, lee la sección siguiente: hay una decisión de arquitectura que conviene
que conozcas, porque determina de dónde salen los números del tablero.

---

## De dónde deben salir los datos del tablero

El Seat API ya calcula los indicadores y los expone en `/api/reportes/*`, pero
**su almacenamiento es en memoria**. Eso significa:

- se pierde al reiniciar el servicio,
- en Vercel cada instancia *serverless* tiene su propia copia.

Sirve como **vista operativa en vivo** (qué se está vendiendo ahora, ocupación,
órdenes en curso). No sirve como histórico, y un tablero gerencial es
precisamente un histórico.

La división correcta es esta:

| Dato | Dónde vive | Por qué |
|---|---|---|
| Disponibilidad, bloqueos, transacción del pago | Seat API | Es su responsabilidad y es efímero por naturaleza |
| **Ventas confirmadas (el histórico)** | **MongoDB del programa principal** | Ya tienes `Reserva`, `Boleto` y `statsRoutes.js` con agregaciones |
| Indicadores del tablero | MongoDB, vía `/api/stats/*` | Sobreviven a reinicios y son la fuente de verdad |

Tu `ReservaSchema` **ya está preparado** para esto: tiene un sub-documento
`pricing` con exactamente la forma que devuelve el Seat API
(`cantidad`, `precioUnitario`, `subtotal`, `porcentajeDescuento`,
`montoDescuento`, `total`). Lo que falta es el pago: `status` solo admite
`reserved | cancelled`, y no hay ni `orderId` ni `captureId`.

El prompt pide, en este orden: guardar el pago en Mongo, extender las
agregaciones y pintar el tablero. Los endpoints del Seat API se usan solo para
la tarjeta de "en vivo".

---

## El prompt

````markdown
Quiero terminar los pagos y que sus datos aparezcan en el dashboard gerencial.
Es la función principal de la app, así que prioriza que los números sean
correctos y auditables por encima de la estética.

El Seat API que procesa los pagos está en
`C:\Repositorios\CulturalTripFinalTesis\apiconsumidorac`. Lee su
`CONTEXTO-PROYECTO.md` antes de empezar: secciones 4 (orquestación con PayPal),
5 (contrato) y 13 (limitaciones del almacenamiento).

## Principio que no se negocia

El **histórico de ventas vive en MongoDB de este proyecto**, no en el Seat API.
El Seat API guarda su estado en memoria: se pierde al reiniciar y en Vercel cada
instancia tiene su propia copia. Sus endpoints `/api/reportes/*` solo valen para
una tarjeta de "actividad en vivo".

Todo indicador gerencial (ingresos del mes, comparativas, rutas más vendidas)
debe calcularse con agregaciones de Mongo sobre datos que este backend haya
persistido.

## 1. Modelo: añadir el pago a la reserva

En `src/models/reservaModel.js`:

- Amplía `status` a `['pending', 'reserved', 'paid', 'cancelled', 'refunded']`.
  Hoy es `['reserved','cancelled']` y no distingue una reserva pagada de una
  apartada en taquilla, que es justo lo que el tablero necesita separar.
- Añade un sub-documento `pago`:

  ```js
  pago: {
    estado:     { type: String, enum: ['pendiente','pagado','fallido','reembolsado'], default: 'pendiente' },
    proveedor:  { type: String, default: 'paypal' },
    orderId:    { type: String, index: true },   // orden de PayPal
    captureId:  { type: String, index: true },   // comprobante del cobro
    moneda:     { type: String },                // moneda del cobro (USD)
    montoCobrado: { type: Number },              // lo cobrado en esa moneda
    tasaConversion: { type: Number },
    pagadoEn:   { type: Date },
    payerEmail: { type: String },
    requiereAtencion: { type: Boolean, default: false },
    conflictos: [{ asiento: Number, motivo: String }]
  }
  ```

- Índice único parcial sobre `pago.captureId` para que un reintento no cree dos
  reservas del mismo cobro:

  ```js
  ReservaSchema.index(
    { 'pago.captureId': 1 },
    { unique: true, partialFilterExpression: { 'pago.captureId': { $type: 'string' } } }
  );
  ```

  Esto es importante: la captura del Seat API es idempotente, pero si el
  frontend reintenta y este backend no se protege, el tablero contará el ingreso
  dos veces.

- `ahorros` está declarado como `Number` dentro de `pricing`, pero el Seat API
  devuelve ahí una cadena (`"Ahorras: $10.500"`). Cámbialo a `String` o ignora
  ese campo al guardar; hoy Mongoose lo descarta en silencio.

## 2. Servicio y endpoint para confirmar el pago

Crea `POST /api/reservas/confirmar-pago`, autenticado, que reciba la respuesta
de `/api/checkout/capturar-orden` del Seat API:

```json
{
  "orderId": "...", "captureId": "...",
  "rutaId": "123", "fecha": "2026-11-20",
  "asientos": [5, 6],
  "pricing": { "cantidad": 2, "total": 95000, "porcentajeDescuento": 5, "montoDescuento": 5000, "precioUnitario": 50000, "subtotal": 100000, "moneda": "COP" },
  "cobro": { "valor": "23.75", "moneda": "USD", "tasaConversion": 4000 },
  "payer": { "email_address": "..." },
  "requiereAtencion": false,
  "conflictos": []
}
```

Debe:

- Resolver el `user` desde el JWT, no del cuerpo. Si el cliente puede decir de
  quién es la venta, el tablero es manipulable.
- Resolver el `ruta` (ObjectId) desde el `rutaId` que usa el Seat API. Mira cómo
  lo hace ya `seatProxy.routes.js` o `asientosRoutes.js` para no duplicar la
  correspondencia.
- **No confiar en el `pricing` del cliente.** Vuelve a pedir la orden al Seat API
  (`GET /api/checkout/orden/{orderId}`) y usa lo que responda. Si no coincide con
  lo recibido, guarda lo del API y registra la discrepancia.
- Ser idempotente: si ya existe una reserva con ese `pago.captureId`, devolverla
  sin crear otra.
- Crear la reserva con `status: 'paid'` y el `pago` completo.
- Si `requiereAtencion` es `true`, guardar `pago.requiereAtencion` y los
  `conflictos`. Significa que se cobró pero algún asiento no se pudo entregar y
  corresponde una devolución: tiene que ser visible, no un dato enterrado.

Sigue la estructura que ya usa el proyecto: `routes/` → `services/` →
`repositories/` → `models/`, con `asyncHandler` y las validaciones de `joi` en
`validations/`.

## 3. Agregaciones para el tablero

Extiende `src/routes/statsRoutes.js` con `GET /api/stats/ingresos`, admin, con
parámetros `from`, `to` y `rutaId`. Calcúlalo con agregaciones de Mongo sobre
`Reserva` filtrando `status: 'paid'`:

- **Ingresos**: total, bruto (antes de descuentos), descuento concedido, ticket
  promedio, ingreso por asiento.
- **Cobrado en pasarela**: suma de `pago.montoCobrado` por `pago.moneda`.
  Súmalo desde cada registro, **no** convirtiendo el total: los redondeos a dos
  decimales de cada cobro no coinciden con el redondeo de la suma.
- **Embudo**: reservas por `status`, y tasa de conversión
  (`paid / (paid + pending + cancelled)`).
- **Por ruta**: `$lookup` a `rutas` para devolver el nombre, no solo el id.
- **Serie temporal**: ingresos y asientos por día y por mes, con
  `$dateToString`. Devuelve los días sin ventas como cero, o el gráfico mentirá
  por omisión.
- **Descuentos por tramo**: agrupado por `pricing.porcentajeDescuento`, para ver
  cuánto cuesta la política comercial.
- **Incidencias**: reservas con `pago.requiereAtencion: true`, con su
  `captureId`, para gestionar devoluciones.

Un detalle que suele salir mal: filtra por fechas sobre el campo correcto.
`createdAt` es cuándo se vendió; `fecha` es cuándo se viaja. Para ingresos del
mes quieres `createdAt`; para ocupación de un viaje, `fecha`. No los mezcles.

Si ya existe `/api/stats/reservas`, reutiliza lo que haga falta en lugar de
duplicar la lógica de filtros.

## 4. El dashboard

En `frontend/src/pages/Dashboard.jsx` (o `Admin.jsx`, donde corresponda al rol
gerencial), añade:

- **Fila de tarjetas**: ingresos del periodo, órdenes pagadas, ticket promedio,
  asientos vendidos, ocupación, descuento concedido. Cada una con su
  comparativa respecto al periodo anterior.
- **Selector de periodo**: hoy, 7 días, 30 días, mes actual, rango libre. Que el
  rango elegido se aplique a todas las consultas, no solo a algunas.
- **Gráfico de ingresos por día**, con los asientos vendidos como segunda serie.
- **Tabla de rutas** ordenada por ingreso, con nombre de ruta, órdenes, asientos
  e ingreso.
- **Aviso de incidencias**: si hay reservas con `requiereAtencion`, una alerta
  visible arriba con el enlace al detalle. No lo entierres en una pestaña.
- **Tarjeta de actividad en vivo**: esta sí consume
  `GET {SEAT_API}/api/reportes/kpis` del Seat API, y debe estar **etiquetada
  como "en vivo, no histórico"** para que nadie confunda esas cifras con las de
  Mongo. Si el Seat API no responde, oculta la tarjeta; no muestres ceros, que
  se leerían como "no se vendió nada".

- **Bloque "Cuenta PayPal"**, con los datos de la cuenta de negocio (la cuenta
  de administrador), desde
  `GET {SEAT_API}/api/reportes/cuenta-pasarela?dias=30`:

  ```json
  {
    "saldo": {
      "cuentaId": "CUQ2ZHR4YGR7Q",
      "saldos": [{ "moneda": "USD", "total": "5123.54", "disponible": "5079.20", "retenido": "44.34" }]
    },
    "movimientos": { "total": 16, "comisionesTotales": "8.96", "movimientos": [...] }
  }
  ```

  Muestra **saldo disponible**, **retenido** y **comisiones del periodo**. Esto
  responde a una pregunta que las ventas no contestan: *cuánto dinero hay de
  verdad en la cuenta*. No coincide con lo facturado, porque PayPal cobra
  comisión por operación (en los datos reales, unos 0,98 USD sobre un cobro de
  12,50) y retiene temporalmente una parte.

  Trátalo como un bloque que puede fallar solo: el informe de transacciones
  necesita el permiso *Transaction Search* en la aplicación de PayPal y en
  sandbox tarda horas en poblarse. Si viene con `error`, muestra solo el saldo;
  un listado vacío **no** significa que no haya ventas.

Formatea los importes con `Intl.NumberFormat('es-CO', { style: 'currency',
currency: 'COP', maximumFractionDigits: 0 })`. Muestra siempre la moneda: hay
dos en juego (COP del negocio, USD del cobro) y confundirlas en un tablero
gerencial es un error caro.

Para los gráficos usa la librería que ya tenga el proyecto. Si no hay ninguna,
pregúntame antes de añadir una dependencia.

## 5. Cerrar el flujo de pago

Si no lo has hecho ya (ver `PROMPT-INTEGRACION.md` del repositorio del Seat API),
conecta el pago en `SeatBooking.jsx`:

```
① POST {SEAT_API}/api/asientos/reservar     → holdIds
② POST {SEAT_API}/api/checkout/crear-orden  → orderId (sin enviar importe)
③ el comprador aprueba en PayPal
④ POST {SEAT_API}/api/checkout/capturar-orden → captureId, reservas
⑤ POST /api/reservas/confirmar-pago          → persiste en Mongo
```

El paso ⑤ es el que hace que el pago llegue al tablero. Si falla, **no pierdas
el cobro**: registra el `captureId` en algún sitio recuperable (una colección de
conciliación, o al menos un log con nivel error) y muéstraselo al usuario. El
dinero ya salió de su cuenta.

## Qué NO hagas

- No calcules los indicadores gerenciales desde el Seat API. Su estado es
  efímero; el histórico es Mongo.
- No toques nada dentro de `apiconsumidorac`.
- No guardes credenciales de PayPal aquí. Las tiene el Seat API; este backend
  solo recibe el resultado del cobro.
- No confíes en importes que vengan del navegador. Verifícalos contra el Seat
  API.
- No añadas dependencias de gráficos sin preguntar.

## Cómo comprobarlo

1. Arranca el Seat API: `cd apiconsumidorac\seat-api && npm run dev`
2. Arranca este proyecto (backend y frontend).
3. Haz una compra real en sandbox con una cuenta **Personal**
   (`@personal.example.com`).
4. Comprueba que: aparece una `Reserva` con `status: 'paid'` y su `pago.captureId`;
   `/api/stats/ingresos` refleja el importe; el tablero muestra la venta.
5. Repite la llamada al paso ⑤ con el mismo `captureId` y verifica que **no**
   se duplica el ingreso.

Al terminar, dime qué archivos cambiaste, qué agregaciones añadiste y qué quedó
pendiente. No hagas commit.
````

---

## Qué necesito de ti si prefieres que lo haga yo

El dashboard está en otro repositorio, así que no escribo ahí por mi cuenta. Si
quieres que lo haga, dime que sí y añade `C:\Repositorios\CulturalTrip` a los
directorios de trabajo.

Y si quieres que **el propio Seat API guarde un histórico** (en vez de delegarlo
a Mongo del programa principal), necesito una variable:

| Variable | Para qué |
|---|---|
| `MONGO_URI` | La misma cadena de conexión que usa tu backend. Escribiría los adaptadores `MongoOrderRepository` y `MongoSeatRepository` contra los puertos que ya existen, y el cambio sería una línea en `container.js`. |

Con eso el Seat API sobreviviría a reinicios y sería consistente entre
instancias de Vercel. Es la alternativa a la división que propone este
documento; no hacen falta las dos.
