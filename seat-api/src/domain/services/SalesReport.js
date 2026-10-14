import { OrderStatus } from '../model/PaymentOrder.js';
import { roundToCurrency } from '../model/Currency.js';

/**
 * Agregación de ventas para el tablero gerencial.
 *
 * Regla de negocio pura: recibe órdenes y devuelve indicadores. No sabe de
 * HTTP, ni de Mongo, ni de PayPal, así que se puede probar con un arreglo de
 * objetos y se comporta igual sea cual sea el almacenamiento.
 *
 * Un criterio que conviene tener claro: **solo las órdenes pagadas cuentan como
 * ingreso**. Las pendientes son intención de compra, no dinero, y mezclarlas
 * infla las cifras que alguien va a usar para decidir. Aparecen en su propio
 * contador y en la tasa de conversión.
 */
export class SalesReport {
  constructor({ pricingPolicy, seatLayout, paymentCurrency, fxRate }) {
    this.pricingPolicy = pricingPolicy;
    this.seatLayout = seatLayout;
    this.paymentCurrency = paymentCurrency;
    this.fxRate = fxRate;
  }

  /**
   * @param {object} input
   * @param {import('../model/PaymentOrder.js').PaymentOrder[]} input.orders
   * @param {number} input.activeHolds   Bloqueos vigentes ahora mismo
   * @param {number} input.reservedSeats Asientos vendidos en total
   * @param {number} input.tripsTracked  Viajes distintos con actividad
   */
  build({ orders, activeHolds = 0, reservedSeats = 0, tripsTracked = 0, from = null, to = null }) {
    const paid = orders.filter((order) => order.status === OrderStatus.PAID);
    const pending = orders.filter((order) => order.status === OrderStatus.PENDING);
    const failed = orders.filter((order) => order.status === OrderStatus.FAILED);
    const cancelled = orders.filter((order) => order.status === OrderStatus.CANCELLED);

    // Los importes se redondean a la precisión de la moneda al sumar. Acumular
    // decimales en coma flotante produce residuos — 34.87 + 23.75 + 12.50 puede
    // dar 71.12000000000001 — y eso acabaría impreso tal cual en el tablero.
    const money = (value) => roundToCurrency(value, this.pricingPolicy.currency);

    const ingresoTotal = money(sum(paid, (order) => order.pricing.total));
    const asientosVendidos = sum(paid, (order) => order.asientos.length);
    const descuentoTotal = money(sum(paid, (order) => order.pricing.montoDescuento));

    // Lo que se cobró de verdad en la pasarela. Se suma desde cada orden en
    // lugar de convertir el total: los redondeos a dos decimales de cada cobro
    // no coinciden con el redondeo de la suma.
    const cobradoPasarela = paid.reduce(
      (total, order) => total + Number.parseFloat(order.paypalAmount?.valor ?? '0'),
      0
    );

    const capacidadVista = tripsTracked * this.seatLayout.totalSeats;

    return {
      periodo: { desde: from, hasta: to },

      ingresos: {
        moneda: this.pricingPolicy.currency,
        total: ingresoTotal,
        // Lo que habría entrado sin descuentos: útil para medir qué cuesta la
        // política comercial.
        bruto: money(ingresoTotal + descuentoTotal),
        descuentoConcedido: descuentoTotal,
        ticketPromedio: paid.length > 0 ? money(ingresoTotal / paid.length) : 0,
        ingresoPorAsiento:
          asientosVendidos > 0 ? money(ingresoTotal / asientosVendidos) : 0,
        cobradoEnPasarela: {
          moneda: this.paymentCurrency,
          valor: cobradoPasarela.toFixed(2),
          tasaConversion: this.fxRate,
        },
      },

      ordenes: {
        total: orders.length,
        pagadas: paid.length,
        pendientes: pending.length,
        fallidas: failed.length,
        canceladas: cancelled.length,
        // De cada 100 órdenes creadas, cuántas acabaron cobradas.
        tasaConversion: orders.length > 0 ? redondea((paid.length / orders.length) * 100) : 0,
        // Las pendientes son intención de compra, no ingreso.
        valorPendiente: money(sum(pending, (order) => order.pricing.total)),
      },

      asientos: {
        vendidos: asientosVendidos,
        reservasConfirmadas: reservedSeats,
        bloqueadosAhora: activeHolds,
        capacidadPorBus: this.seatLayout.totalSeats,
        viajesConActividad: tripsTracked,
        ocupacion:
          capacidadVista > 0 ? redondea((reservedSeats / capacidadVista) * 100) : 0,
      },

      descuentos: {
        moneda: this.pricingPolicy.currency,
        montoTotal: descuentoTotal,
        ordenesConDescuento: paid.filter((order) => order.pricing.montoDescuento > 0).length,
        porTramo: this.#porTramo(paid, money),
      },

      porRuta: this.#agrupar(paid, (order) => order.rutaId, 'rutaId', money),
      porFechaViaje: this.#agrupar(paid, (order) => order.fecha, 'fecha', money),
      porDiaVenta: this.#agrupar(
        paid,
        (order) => new Date(order.updatedAt ?? order.createdAt).toISOString().slice(0, 10),
        'dia',
        money
      ),

      // Órdenes cobradas donde algún asiento no se pudo entregar: corresponde
      // una devolución y alguien tiene que verlas.
      incidencias: paid
        .filter((order) => order.events.some((event) => event.type === 'NEEDS_ATTENTION'))
        .map((order) => ({
          orderId: order.orderId,
          captureId: order.captureId,
          rutaId: order.rutaId,
          fecha: order.fecha,
          userId: order.userId,
          total: order.pricing.total,
          conflictos:
            order.events.find((event) => event.type === 'NEEDS_ATTENTION')?.conflictos ?? [],
        })),

      ultimasOrdenes: [...orders]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10)
        .map((order) => ({
          orderId: order.orderId,
          estado: order.status,
          rutaId: order.rutaId,
          fecha: order.fecha,
          asientos: order.asientos,
          total: order.pricing.total,
          moneda: order.pricing.moneda,
          captureId: order.captureId,
          companyName: order.companyName,
          creadaEn: order.createdAt,
          actualizadaEn: order.updatedAt,
        })),
    };
  }

  /** Cuánto se vendió en cada tramo de descuento. */
  #porTramo(paid, money) {
    const tramos = new Map();

    for (const order of paid) {
      const pct = order.pricing.porcentajeDescuento;
      const actual = tramos.get(pct) ?? { porcentaje: pct, ordenes: 0, asientos: 0, descuento: 0 };
      actual.ordenes += 1;
      actual.asientos += order.asientos.length;
      actual.descuento += order.pricing.montoDescuento;
      tramos.set(pct, actual);
    }

    return [...tramos.values()]
      .map((tramo) => ({ ...tramo, descuento: money(tramo.descuento) }))
      .sort((a, b) => a.porcentaje - b.porcentaje);
  }

  /** Agrupa órdenes pagadas por una clave y suma sus indicadores. */
  #agrupar(paid, keyOf, keyName, money) {
    const grupos = new Map();

    for (const order of paid) {
      const key = keyOf(order);
      if (key === undefined || key === null) continue;

      const actual = grupos.get(key) ?? { [keyName]: key, ordenes: 0, asientos: 0, ingresos: 0 };
      actual.ordenes += 1;
      actual.asientos += order.asientos.length;
      actual.ingresos += order.pricing.total;
      grupos.set(key, actual);
    }

    return [...grupos.values()]
      .map((grupo) => ({ ...grupo, ingresos: money(grupo.ingresos) }))
      .sort((a, b) => b.ingresos - a.ingresos);
  }
}

const sum = (items, valueOf) => items.reduce((total, item) => total + (valueOf(item) || 0), 0);
const redondea = (value) => Math.round(value * 10) / 10;
