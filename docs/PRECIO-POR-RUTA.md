# Precio por ruta: cómo la aplicación consumidora fija el importe que cobra PayPal

## El problema

La Seat API cotizaba siempre con `BASE_PRICE` (12,50 USD). CulturalTrip tiene un precio
distinto por ruta (Guayaquil–Quito: 18 USD). El comprador veía 18 en la aplicación y
PayPal le cobraba 12,50, porque la orden la creaba esta API con su propio precio y no
aceptaba ninguno externo.

## La solución

El precio unitario de la ruta viaja **con el bloqueo** y se queda guardado en el hold.
La orden de PayPal se cotiza desde los holds, nunca desde el cuerpo de la petición de
checkout, así que el navegador sigue sin poder manipular el importe.

```
consumidor ─ POST /api/asientos/reservar { asientos, userId, precioUnitario: 18 }
             └─ Hold { …, precioUnitario: 18 }           (uno por asiento)

consumidor ─ POST /api/checkout/crear-orden { holdIds, userId }
             └─ PricingPolicy.quote(n, { unitPrice: hold.precioUnitario })  → PayPal 18.00
```

### Qué cambió en el código

| Archivo | Cambio |
|---|---|
| `domain/model/Hold.js` | Nuevo campo `precioUnitario` (null = usar `BASE_PRICE`). |
| `domain/services/PricingPolicy.js` | `quote(quantity, { unitPrice })` y `resolveUnitPrice()`: valida número finito, > 0 y ≤ 10 000 (`MAX_UNIT_PRICE`), redondea a la moneda. La cotización devuelve `priceSource: 'ruta' | 'api'`. |
| `application/use-cases/HoldSeats.js` | Acepta `precioUnitario`, lo valida antes de tocar el inventario y lo guarda en cada hold. `pricing.origenPrecio` en la respuesta. |
| `application/use-cases/CreateCheckoutOrder.js` | Toma el precio de los holds. Si una orden mezcla precios distintos → `400 VALIDATION_ERROR`. |
| `application/use-cases/CalculatePrice.js` | Acepta `precioUnitario`; devuelve `origenPrecio`. |
| `infrastructure/http/controllers/asientos.controller.js` | Pasa `precioUnitario` desde body/query en `/reservar` y `/calcular-precio`. |
| `infrastructure/http/routes/asientos.routes.js` | Nueva ruta `POST /api/asientos/calcular-precio` (además del alias `/calcular-precio` en la raíz) y Swagger de `precioUnitario`. |

### Contrato

`POST /api/asientos/reservar`

```json
{ "rutaId": "6723…", "fecha": "2026-12-01", "asientos": [5, 6], "userId": "u1", "precioUnitario": 18 }
```

Respuesta (`pricing`): `precioUnitario: 18, subtotal: 36, porcentajeDescuento: 5,
montoDescuento: 1.8, total: 34.2, origenPrecio: "ruta"`.

`POST /api/asientos/calcular-precio` (o `POST /calcular-precio`)

```json
{ "cantidad": 2, "precioUnitario": 18 }
```

Sin `precioUnitario` ambos endpoints se comportan como antes (`origenPrecio: "api"`).

### Reglas

- La tabla de descuentos (2 → 5 %, 3 → 7 %, 4 → 10 %, ≥ 5 → 20 % con razón social) y el
  redondeo a centavos son los mismos con cualquier precio: una única función
  (`PricingPolicy.quote`) alimenta la cotización, el hold y la orden.
- `precioUnitario` inválido (0, negativo, texto, > 10 000) → `400`.
- Holds con precios distintos en la misma orden → `400`.
- Compatibilidad: los consumidores que no envían precio no notan ningún cambio.

### Verificado

- Local: hold `precioUnitario: 18` × 2 → total 34,20; orden con holds mezclados → 400.
- PayPal Sandbox real: orden creada con ruta de 18 USD → `purchase_units[0].amount.value = "18.00"`.
- `npm run smoke`: 23/23.

### El frontend de demostración

`TripControls` tiene un campo **Precio por asiento**. Vacío usa el `BASE_PRICE` del API;
con un valor (p. ej. 18) reproduce exactamente lo que hace CulturalTrip: el precio viaja
en el hold y PayPal cobra ese importe. `PriceBreakdown` indica "Precio unitario (de la
ruta)" cuando el precio vino del consumidor.
