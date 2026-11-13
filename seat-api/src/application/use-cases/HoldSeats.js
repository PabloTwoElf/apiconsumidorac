import { randomUUID } from 'node:crypto';
import { ConflictError, ValidationError } from '../../domain/errors/DomainError.js';
import { Hold } from '../../domain/model/Hold.js';

/**
 * Caso de uso: bloquear uno o varios asientos.
 *
 * Acepta un asiento (`asiento`) o varios (`asientos`) y es todo-o-nada: si uno
 * de los asientos pedidos ya está tomado, se revierten los holds creados en
 * esta misma llamada. Sin eso, un carrito de 4 asientos podría dejar 3
 * bloqueados y devolver error, atrapando asientos que nadie va a pagar.
 */
export class HoldSeats {
  constructor({ seatRepository, seatLayout, pricingPolicy, clock, holdTtlMs }) {
    this.seatRepository = seatRepository;
    this.seatLayout = seatLayout;
    this.pricingPolicy = pricingPolicy;
    this.clock = clock;
    this.holdTtlMs = holdTtlMs;
  }

  execute({ rutaId, fecha, asiento, asientos, userId, companyName = null, precioUnitario = null }) {
    const requested = this.#normalizeSeats({ asiento, asientos });

    if (!rutaId || !fecha || !userId) {
      throw new ValidationError('rutaId, fecha, userId y al menos un asiento son obligatorios');
    }

    // Precio de la ruta fijado por el consumidor. Se valida aquí (antes de
    // tocar el inventario) y se guarda en cada hold, para que la orden de PayPal
    // lo recupere sin que el navegador tenga que volver a enviarlo.
    const unitPrice = this.pricingPolicy.resolveUnitPrice(precioUnitario);

    requested.forEach((numero) => this.seatLayout.assertValidSeat(numero));

    const now = this.clock.now();
    this.seatRepository.purgeExpiredHolds(now);

    // Las reglas se aplican sobre el TOTAL de asientos que el usuario tendría
    // bloqueados en este viaje (los que ya tiene + los que pide ahora), no solo
    // sobre esta llamada. Así no se pueden saltar el máximo ni la exigencia de
    // razón social bloqueando los asientos de uno en uno.
    const ownHolds = this.seatRepository
      .listHoldsForTrip(rutaId, fecha)
      .filter((hold) => !hold.isExpiredAt(now) && hold.belongsTo(userId));
    const ownSeats = new Set(ownHolds.map((hold) => hold.asiento));
    const newSeats = requested.filter((numero) => !ownSeats.has(numero));
    const totalSeats = ownHolds.length + newSeats.length;

    if (totalSeats > this.pricingPolicy.maxSeats) {
      throw new ValidationError(
        `No se pueden reservar más de ${this.pricingPolicy.maxSeats} asientos por viaje (ya tienes ${ownHolds.length} bloqueados)`,
        { maxSeats: this.pricingPolicy.maxSeats, bloqueados: ownHolds.length }
      );
    }

    const company =
      String(companyName || '').trim() || ownHolds.find((hold) => hold.companyName)?.companyName || '';

    if (this.pricingPolicy.requiresCompanyName(totalSeats) && !company) {
      throw new ValidationError(
        `Para ${this.pricingPolicy.corporateFrom} asientos o más se requiere el nombre de la compañía`,
        { corporateFrom: this.pricingPolicy.corporateFrom, code: 'COMPANY_REQUIRED' }
      );
    }

    // Si ya hay holds propios sin precio propio, se hereda el suyo: una orden no
    // puede mezclar precios unitarios.
    const effectiveUnitPrice = unitPrice ?? ownHolds.find((hold) => hold.precioUnitario)?.precioUnitario ?? null;

    const created = [];
    try {
      for (const numero of newSeats) {
        if (this.seatRepository.findReservation(rutaId, fecha, numero)) {
          throw new ConflictError(`El asiento ${numero} ya está reservado`, { asiento: numero });
        }
        const existing = this.seatRepository.findHold(rutaId, fecha, numero);
        if (existing && !existing.isExpiredAt(now)) {
          throw new ConflictError(`El asiento ${numero} tiene un bloqueo activo`, { asiento: numero });
        }

        const hold = new Hold({
          holdId: `hold_${now}_${randomUUID()}`,
          rutaId,
          fecha,
          asiento: numero,
          userId,
          companyName: company || null,
          precioUnitario: effectiveUnitPrice,
          createdAt: now,
          expiresAt: now + this.holdTtlMs,
        });

        this.seatRepository.saveHold(hold);
        created.push(hold);
      }
    } catch (error) {
      // Reversión: ningún asiento queda bloqueado si la operación no se completó.
      for (const hold of created) {
        this.seatRepository.deleteHold(hold.rutaId, hold.fecha, hold.asiento);
      }
      throw error;
    }

    const pricing = this.pricingPolicy.quote(totalSeats, { unitPrice: effectiveUnitPrice });
    const expiresAt = now + this.holdTtlMs;

    return {
      // Campos singulares: compatibilidad con el contrato anterior de /reservar.
      holdId: created[0].holdId,
      asiento: created[0].asiento,
      // Campos plurales para el carrito completo.
      holdIds: created.map((h) => h.holdId),
      asientos: created.map((h) => h.asiento),
      holds: created.map((h) => ({ holdId: h.holdId, asiento: h.asiento })),
      expiresAt,
      remainingMs: this.holdTtlMs,
      ttlMs: this.holdTtlMs,
      pricing: {
        cantidad: pricing.quantity,
        moneda: pricing.currency,
        precioUnitario: pricing.basePrice,
        subtotal: pricing.baseTotal,
        porcentajeDescuento: pricing.discountPercent,
        montoDescuento: pricing.discountAmount,
        total: pricing.total,
        ahorros: pricing.savings,
        origenPrecio: pricing.priceSource,
      },
    };
  }

  #normalizeSeats({ asiento, asientos }) {
    const raw = Array.isArray(asientos) && asientos.length > 0 ? asientos : [asiento];
    const parsed = raw
      .filter((n) => n !== undefined && n !== null && n !== '')
      .map((n) => Number(n));

    if (parsed.length === 0) {
      throw new ValidationError('Debes indicar al menos un asiento');
    }
    if (parsed.some((n) => !Number.isInteger(n))) {
      throw new ValidationError('Los asientos deben ser números enteros');
    }

    const unique = [...new Set(parsed)];
    if (unique.length !== parsed.length) {
      throw new ValidationError('La lista de asientos contiene duplicados');
    }

    return unique.sort((a, b) => a - b);
  }
}
