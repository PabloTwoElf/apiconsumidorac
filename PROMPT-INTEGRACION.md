# Prompt para conectar el programa principal con el Seat API

Pega el bloque de abajo en Claude Code **dentro de `C:\Repositorios\CulturalTrip`**
(el repositorio del programa principal, no este).

El prompt le da todo lo que necesita: el contrato del API, el flujo de pago, lo
que ya existe en ese repositorio y lo que no hay que tocar.

---

## El prompt

````markdown
Conecta este proyecto (CulturalTrip) con el Seat API que vive en
`C:\Repositorios\CulturalTripFinalTesis\apiconsumidorac`. Su documentación
completa está en `CONTEXTO-PROYECTO.md` de ese repositorio: léela antes de
empezar, sobre todo las secciones 4 (orquestación con PayPal), 5 (contrato) y
6 (cómo consumirlo).

## Qué hay ahora en este proyecto

- `frontend/` — Vite + React en el puerto 3000 (arranca en el 3001 si está ocupado)
- `backend/` — `BusReservation API` en el puerto 5000
- `frontend/src/services/asientosService.js` ya llama al Seat API: usa
  `VITE_SEAT_API_URL` y le añade `/disponibles`, `/reservar`, `/holds`
- `frontend/src/pages/SeatBooking.jsx` es la pantalla de selección de asientos
- `frontend/vite.config.js` ya tiene un proxy de `/api` hacia el backend propio

## Qué quiero que hagas

### 1. Quitar los puertos fijos de la configuración

En `frontend/vite.config.js`, añade al proxy una entrada para el Seat API que
descubra su puerto al arrancar, en lugar de tenerlo escrito. El Seat API se
identifica porque `GET /api/sistema/diagnostico` devuelve `servicio: "seat-api"`
— esa comprobación es necesaria: el backend propio también responde a `/health`
y confundirlos mandaría las peticiones al servicio equivocado.

Sondea los puertos 5008, 5009, 5010, 4000 y 8080, en ese orden, con un tiempo de
espera corto (700 ms) y en paralelo. Reenvía a ese destino las rutas
`/seat-api/*`, y reescribe el prefijo para que lleguen al API como `/api/*`.

Hay una implementación ya hecha de ese descubrimiento en
`apiconsumidorac/scripts/ports.mjs`; cópiala y adáptala, no la importes de otro
repositorio.

Luego cambia `asientosService.js` para que su base sea `/seat-api/asientos`
(relativa, a través del proxy) cuando no haya `VITE_SEAT_API_URL`. Así en
desarrollo no hay CORS ni puertos que mantener, y en producción basta apuntar
`VITE_SEAT_API_URL` al dominio desplegado.

### 2. Revisar el fallback silencioso

`asientosService.js` devuelve una lista de asientos inventada cuando el API
responde 404 o agota el tiempo, marcándola con `_isFallback: true`. Eso ocultó
durante un tiempo que el API estaba caída: la interfaz seguía mostrando asientos.

Mantén el fallback si te parece útil para demostraciones, pero haz que
`SeatBooking.jsx` muestre un aviso visible cuando `_isFallback` sea `true`
("datos de demostración, el API no responde"). Que no se pueda confundir con
datos reales.

### 3. Usar el view-model en lugar de /disponibles

Cambia `SeatBooking.jsx` para que consuma `GET /asientos/view-model` pasando
`rutaId`, `fecha` y `userId`. Devuelve cada asiento con un estado pensado para
la interfaz:

| estado | significado | seleccionable |
|---|---|---|
| `disponible` | libre | sí |
| `miHold` | bloqueado por este `userId` (incluye su `holdId`) | ya es tuyo |
| `en_hold` | bloqueado por otro comprador | no |
| `ocupado` | vendido y pagado | no |

También trae `resumen` (contadores) y `precios` (precio unitario, máximo de
asientos, umbral de descuento corporativo), así que sustituye a las llamadas
paralelas a `/disponibles` + `/holds`.

El `userId` debe ser el del usuario autenticado: sácalo del JWT como ya hace
`CLIENT_ID()` en `asientosService.js`. Es importante que sea estable entre
recargas, porque es lo que permite al API reconocer los bloqueos como propios.

### 4. Añadir el flujo de pago con PayPal

Hoy el servicio bloquea asientos pero no cobra. Añade los pasos que faltan.

El flujo completo es:

```
① POST /asientos/reservar          { rutaId, fecha, asientos: [5,6], userId, companyName? }
                                   → { holdIds, asientos, expiresAt, ttlMs, pricing }

② POST /checkout/crear-orden       { holdIds, userId }
                                   → { orderId, approvalUrl, pricing, cobro }

③ el comprador aprueba en PayPal

④ POST /checkout/capturar-orden    { orderId, userId }
                                   → { captureId, reservas, conflictos, requiereAtencion, pricing }
```

Reglas que hay que respetar:

- **No envíes el importe nunca.** El paso ② recibe solo `holdIds`; el API
  recalcula el precio en el servidor. Si mandas un total, lo ignora.
- **No envíes `returnUrl`.** El API deduce a dónde devolver al comprador a
  partir del origen de la petición y lo guarda en la orden, así que funciona
  con cualquier puerto sin configurar nada. Al volver, el comprador llega a
  `{tu-origen}/seat-booking?orden=<orderId>&estado=aprobada`.
- **El paso ④ es idempotente**: repetirlo sobre una orden ya pagada devuelve
  `yaProcesada: true` sin cobrar de nuevo. Puedes reintentarlo sin miedo.
- **`companyName` es obligatorio desde 5 asientos** (lo indica
  `requiereCompania` en `/calcular-precio`), o el paso ① falla con 400.

Para los botones de PayPal, pide la configuración a
`GET /checkout/configuracion`, que devuelve el `clientId` público y el modo
(`sandbox` o `live`). Carga el SDK con ese `clientId` y, en su callback
`createOrder`, llama al paso ② y devuelve el `orderId`. En `onApprove`, llama al
paso ④.

### 5. Mostrar el tiempo del bloqueo

El paso ① devuelve `expiresAt` (marca de tiempo absoluta) y `ttlMs`. Muestra una
cuenta atrás: si no, los asientos se liberan a los 10 minutos y el usuario no
entiende por qué.

Calcula el tiempo restante contra `expiresAt`, **no** restando un segundo por
tick: si la pestaña queda en segundo plano el navegador frena los temporizadores
y un contador incremental se desincroniza del servidor.

### 6. Liberar los bloqueos al abandonar

Llama a `DELETE /asientos/holds` con `{ holdIds, userId }` cuando el usuario
cancele o salga de la pantalla. Es idempotente. Para el cierre de pestaña, usa
`navigator.sendBeacon` contra `POST /asientos/holds/liberar?holdIds=a,b&userId=x`
— `sendBeacon` solo puede hacer POST y no admite cuerpo JSON, y ese endpoint
existe precisamente para eso.

### 7. Registrar la venta en el backend propio

Esto es importante: **el Seat API guarda su estado en memoria**. En Vercel cada
instancia serverless tiene su propia copia y las instancias frías empiezan
vacías.

Cuando el paso ④ confirme el pago, persiste en el backend de este proyecto
(`backend/`, puerto 5000) al menos:

- `orderId` y `captureId` de PayPal (el comprobante del cobro)
- `rutaId`, `fecha` y los números de asiento reservados
- el `pricing` devuelto (cantidad, descuento, total)
- el `userId` del comprador

Así la venta queda registrada aunque el Seat API se reinicie. Añade el endpoint
y la tabla o modelo que haga falta, siguiendo la arquitectura hexagonal que ya
usa `backend/`.

### 8. Manejar el caso de cobro con incidencias

Si el paso ④ devuelve `requiereAtencion: true`, el pago **se cobró** pero algún
asiento no se pudo reservar porque otro comprador se adelantó mientras el
usuario estaba en PayPal. `conflictos` dice cuáles.

No lo trates como un error genérico: muestra el `captureId` y un mensaje claro
de que corresponde una devolución, y regístralo en el backend para poder
gestionarla.

## Qué NO hagas

- No dupliques la tabla de descuentos en el frontend. Usa
  `POST /calcular-precio` con `{ cantidad }`; devuelve el desglose y el importe
  que se cobrará en PayPal. Que el precio se calcule en dos sitios garantiza que
  algún día no coincidan.
- No toques nada dentro de `apiconsumidorac`. Ese repositorio es el API y ya
  está terminado y probado.
- No pongas credenciales de PayPal en este proyecto. Las tiene el Seat API; aquí
  solo se usa el `clientId` público que devuelve `/checkout/configuracion`.
- No escribas secretos en archivos `.env` versionados. Comprueba que `.env`
  está en `.gitignore` antes de añadir nada.

## Cómo comprobar que funciona

```bash
# 1. Arranca el Seat API
cd C:\Repositorios\CulturalTripFinalTesis\apiconsumidorac\seat-api
npm install && npm run dev

# 2. Comprueba en qué puerto quedó cada cosa
cd C:\Repositorios\CulturalTripFinalTesis\apiconsumidorac
npm run puertos

# 3. Arranca este proyecto
cd C:\Repositorios\CulturalTrip\backend  && npm run dev
cd C:\Repositorios\CulturalTrip\frontend && npm run dev
```

Luego, en `/seat-booking`: elige asientos, bloquéalos, paga con una cuenta
**Personal** de PayPal Sandbox (la que termina en `@personal.example.com`) y
verifica que los asientos pasan a `ocupado` y que la venta quedó registrada en
el backend.

Al terminar, dime qué archivos cambiaste y qué quedó pendiente. No hagas commit.
````

---

## Antes de pegarlo

Conviene tener esto en marcha, porque el prompt pide comprobar el resultado:

```bash
# Seat API
cd C:\Repositorios\CulturalTripFinalTesis\apiconsumidorac\seat-api
npm run dev
```

Y asegúrate de que `seat-api/.env` tiene las credenciales de PayPal Sandbox
(`PAYPAL_CLIENT_ID` y `PAYPAL_CLIENT_SECRET`). Para confirmarlo:

```bash
curl http://localhost:5008/api/sistema/paypal
# {"ok":true,"conectado":true,...}
```

## Si prefieres ir por partes

El prompt completo son ocho tareas. Si quieres hacerlo en etapas, pide solo
algunas y en este orden, que respeta las dependencias:

1. Apartados **1 y 3** — quitar los puertos fijos y pasar al view-model.
   Deja la pantalla funcionando igual que ahora, pero sin configuración frágil.
2. Apartados **4 y 5** — el pago y la cuenta atrás. Es el bloque grande.
3. Apartados **6, 7 y 8** — liberación, registro de la venta y el caso de
   cobro con incidencias. Son los detalles que separan una demostración de algo
   utilizable.
4. Apartado **2** — el aviso del fallback. Independiente de todo lo demás.
