# Seat Availability API

API REST para gestión de disponibilidad de asientos con hold (bloqueos temporales) y reservas confirmadas.

## Instalación

```bash
# Instalar dependencias
npm install

# Crear archivo .env
cp .env.example .env
```

## Configuración

Edita `.env`:

```env
PORT=5000
NODE_ENV=development
SEAT_HOLD_TTL_MS=600000        # 10 minutos - Duración máxima de un hold
PURGE_INTERVAL_MS=120000        # 2 minutos - Intervalo de limpieza de holds expirados
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

- `SEAT_HOLD_TTL_MS`: Tiempo en milisegundos que un hold permanece activo (default: 600000ms = 10min)
- `PURGE_INTERVAL_MS`: Intervalo de limpieza automática de holds expirados (default: 120000ms = 2min)
- `ALLOWED_ORIGINS`: URLs permitidas por CORS (separadas por comas). En desarrollo sin configurar acepta `*`

## Scripts

```bash
# Desarrollo (con reinicio automático)
npm run dev

# Producción
npm start
```

## Documentación de API

Una vez iniciado el servidor, accede a:
- **Swagger UI**: http://localhost:5000/api-docs
- **JSON OpenAPI**: http://localhost:5000/api-docs.json

## Endpoints

### 1. GET /health
Health check simple.

**Respuesta:**
```json
{ "ok": true }
```

### 2. GET /api/asientos/disponibles
Obtiene asientos disponibles para una ruta y fecha.

**Query Parameters:**
- `rutaId` (required): ID de la ruta
- `fecha` (required): Fecha en formato YYYY-MM-DD

**Respuesta (200):**
```json
{
  "ok": true,
  "rutaId": "123",
  "fecha": "2026-01-26",
  "available": [1, 2, 3, 5, 6],
  "total": 5
}
```

**cURL:**
```bash
curl "http://localhost:5000/api/asientos/disponibles?rutaId=123&fecha=2026-01-26"
```

### 3. POST /api/asientos/reservar
Crea un hold (bloqueo temporal) para un asiento. Retorna un `holdId` que expira en `SEAT_HOLD_TTL_MS`.

**Body:**
```json
{
  "rutaId": "123",
  "fecha": "2026-01-26",
  "asiento": 5,
  "userId": "user-456"
}
```

**Respuesta (200):**
```json
{
  "ok": true,
  "holdId": "hold_1704960000000_0.1234",
  "expiresAt": 1704960600000,
  "remainingMs": 600000
}
```

**Error (409):**
```json
{
  "ok": false,
  "error": "Seat already occupied or on hold"
}
```

**cURL:**
```bash
curl -X POST http://localhost:5000/api/asientos/reservar \
  -H "Content-Type: application/json" \
  -d '{
    "rutaId": "123",
    "fecha": "2026-01-26",
    "asiento": 5,
    "userId": "user-456"
  }'
```

### 4. GET /api/asientos/holds
Obtiene lista de todos los holds activos (no expirados) con tiempo restante.

**Respuesta (200):**
```json
{
  "ok": true,
  "holds": [
    {
      "holdId": "hold_1704960000000_0.1234",
      "rutaId": "123",
      "fecha": "2026-01-26",
      "asiento": 5,
      "userId": "user-456",
      "expiresAt": 1704960600000,
      "remainingMs": 598000
    }
  ],
  "count": 1
}
```

**cURL:**
```bash
curl http://localhost:5000/api/asientos/holds
```

### 5. DELETE /api/asientos/holds
Libera manualmente un hold antes de que expire.

**Body:**
```json
{
  "rutaId": "123",
  "fecha": "2026-01-26",
  "asiento": 5
}
```

**Respuesta (200):**
```json
{ "ok": true }
```

**Error (409):**
```json
{
  "ok": false,
  "error": "Hold not found"
}
```

**cURL:**
```bash
curl -X DELETE http://localhost:5000/api/asientos/holds \
  -H "Content-Type: application/json" \
  -d '{
    "rutaId": "123",
    "fecha": "2026-01-26",
    "asiento": 5
  }'
```

### 6. POST /api/asientos/reservar-definitivo
Convierte un hold a reserva confirmada (permanente).

**Body:**
```json
{
  "rutaId": "123",
  "fecha": "2026-01-26",
  "asiento": 5,
  "holdId": "hold_1704960000000_0.1234"
}
```

**Respuesta (200):**
```json
{
  "ok": true,
  "reservedAt": 1704960300000
}
```

**Error (409):**
```json
{
  "ok": false,
  "error": "Hold not found or invalid"
}
```

**cURL:**
```bash
curl -X POST http://localhost:5000/api/asientos/reservar-definitivo \
  -H "Content-Type: application/json" \
  -d '{
    "rutaId": "123",
    "fecha": "2026-01-26",
    "asiento": 5,
    "holdId": "hold_1704960000000_0.1234"
  }'
```

## Flujo típico

1. **GET /api/asientos/disponibles** → Ver asientos libres
2. **POST /api/asientos/reservar** → Crear hold (reserva temporal)
3. **GET /api/asientos/holds** → Verificar holds activos
4. **POST /api/asientos/reservar-definitivo** → Confirmar reserva
5. **(Opcional) DELETE /api/asientos/holds** → Cancelar antes de confirmar

## Consumo desde JavaScript/TypeScript

```typescript
// Obtener asientos disponibles
const response = await fetch(
  'http://localhost:5000/api/asientos/disponibles?rutaId=123&fecha=2026-01-26'
);
const data = await response.json();
console.log(data.available); // [1, 2, 3, 5, ...]

// Crear hold
const holdResponse = await fetch('http://localhost:5000/api/asientos/reservar', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rutaId: '123',
    fecha: '2026-01-26',
    asiento: 5,
    userId: 'user-456'
  })
});
const holdData = await holdResponse.json();
const holdId = holdData.holdId;

// Confirmar reserva
const confirmResponse = await fetch(
  'http://localhost:5000/api/asientos/reservar-definitivo',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rutaId: '123',
      fecha: '2026-01-26',
      asiento: 5,
      holdId
    })
  }
);
const confirmData = await confirmResponse.json();
console.log(confirmData.ok); // true
```

## Notas

- **Storage en memoria**: Los datos se pierden si se reinicia el servidor
- **Purga automática**: Se ejecuta cada `PURGE_INTERVAL_MS` y en cada request
- **CORS**: Por defecto acepta cualquier origen en desarrollo, configurable en `.env`
- **Asientos**: Simulado con 40 asientos por ruta/fecha
- **IDs únicos**: `holdId` y `reservedAt` basados en timestamp + UUID

## Despliegue en Render

1. Crea un nuevo "Web Service" en Render
2. Conecta este repositorio
3. Build command: `npm install`
4. Start command: `npm start`
5. Configura variables de entorno en el panel de Render
6. URL base: `https://tu-render-app.onrender.com`

## Licencia

ISC
