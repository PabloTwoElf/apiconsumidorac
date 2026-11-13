# Estado del proyecto — apiconsumidorac (noviembre 2026)

Repositorio con dos piezas que se despliegan juntas en un solo proyecto de Vercel
(`https://apiconsumidorac.vercel.app`):

- **`seat-api/`** — API de asientos con arquitectura hexagonal + MVC: holds temporales,
  reservas, cotización con descuentos por volumen, pasarela PayPal Sandbox, reportes y
  panel HTML de diagnóstico en `/`. Se sirve bajo `/api` mediante `api/index.js`.
- **Frontend Vite + React + TypeScript** (raíz) — demostración completa del flujo:
  mapa del bus, bloqueo, pago con PayPal y comprobante.

El consumidor principal es **CulturalTrip** (repositorio XTest). Su contexto de
integración está en `XTest/docs/INTEGRACION-SEAT-API.md`; el histórico completo de
decisiones de este repositorio, en [`../CONTEXTO-PROYECTO.md`](../CONTEXTO-PROYECTO.md).

---

## Qué cambió en esta revisión

1. **Precio por ruta** ([`PRECIO-POR-RUTA.md`](PRECIO-POR-RUTA.md)). El consumidor puede
   enviar `precioUnitario` al bloquear y al cotizar; la orden de PayPal se cobra con ese
   precio. Resuelve que PayPal cobrara 12,50 USD cuando la ruta valía 18.
2. **Ruta nueva** `POST /api/asientos/calcular-precio` (antes solo existía el alias
   `/calcular-precio` en la raíz; el consumidor lo tenía documentado como 404).
3. **Sin emojis.** Panel HTML y frontend usan iconos SVG (`views/icons.js`,
   `src/components/Icon.tsx`) que heredan el color del texto y respetan el tema.
4. **Bus delimitado.** `SeatMap` dibuja parabrisas, cabina con volante y puerta,
   laterales marcados como ventana, número de fila, pasillo con guía y cola. Cada
   asiento muestra ventana/pasillo y una marca de esquina para no depender del color.
5. **Campo "Precio por asiento"** en los controles del viaje para reproducir el flujo
   de CulturalTrip desde este frontend.
6. Plantillas `.env.example` restauradas y actualizadas (raíz y `seat-api/`).

## Comprobaciones

| Comprobación | Resultado |
|---|---|
| `npm run build` (tsc estricto + Vite) | correcto |
| `npm run lint` | 0 errores |
| `npm run check:render` | todos los componentes renderizan |
| `cd seat-api && npm run smoke` | 23 / 23 |
| Orden PayPal Sandbox con `precioUnitario: 18` | PayPal registra `18.00 USD` |

## Variables de entorno

No hay variables nuevas obligatorias. `BASE_PRICE` pasa a ser el valor por defecto
cuando el consumidor no envía precio. Ver `.env.example` en la raíz y en `seat-api/`, y
la tabla completa en `XTest/docs/VARIABLES-DE-ENTORNO.md`.

## Limitaciones conocidas

- Holds y órdenes viven **en memoria**. En Vercel cada instancia tiene su propio
  inventario y se reinicia; CulturalTrip lo cruza con sus reservas en Mongo. Para
  consistencia total: persistir en Redis/Mongo o desplegar `seat-api` en Render como
  proceso único (`render.yaml`).
- El webhook de PayPal se acepta sin verificar si no hay `PAYPAL_WEBHOOK_ID`
  (aceptable en sandbox).
