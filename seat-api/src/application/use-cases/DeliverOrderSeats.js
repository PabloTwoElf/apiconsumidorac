import { Reservation } from '../../domain/model/Reservation.js';

/**
 * Caso de uso: entregar los asientos de una orden cuyo cobro ya está aceptado.
 *
 * Lo usan la captura automática (PayPal respondió COMPLETED) y la aprobación
 * manual del administrador (PayPal respondió PENDING y alguien lo revisó). La
 * regla vive una sola vez:
 *
 *  - hold vigente → se confirma la reserva con ConfirmReservation
 *  - hold vencido pero asiento libre → se honra igual, el dinero ya se aceptó
 *  - asiento tomado por otro → conflicto, para gestionar la devolución
 */
export class DeliverOrderSeats {
  constructor({ seatRepository, confirmReservation }) {
    this.seatRepository = seatRepository;
    this.confirmReservation = confirmReservation;
  }

  execute({ order, captureId, now }) {
    const reservas = [];
    const conflictos = [];

    order.holdIds.forEach((holdId, indice) => {
      const hold = this.seatRepository.findHoldById(holdId);

      if (hold && !hold.isExpiredAt(now)) {
        const result = this.confirmReservation.execute({
          rutaId: hold.rutaId,
          fecha: hold.fecha,
          asiento: hold.asiento,
          holdId,
          orderId: order.orderId,
          captureId,
        });
        reservas.push({ asiento: result.asiento, estado: 'reservado', reservedAt: result.reservedAt });
        return;
      }

      // El hold ya no vale. Buscamos el asiento por la orden, que sí lo recuerda.
      const asiento = order.asientos[indice];

      if (this.seatRepository.findReservation(order.rutaId, order.fecha, asiento)) {
        conflictos.push({
          asiento,
          estado: 'no_disponible',
          motivo: 'El bloqueo expiró y otro comprador reservó el asiento',
        });
        return;
      }

      this.seatRepository.saveReservation(
        new Reservation({
          rutaId: order.rutaId,
          fecha: order.fecha,
          asiento,
          userId: order.userId,
          holdId,
          orderId: order.orderId,
          captureId,
          reservedAt: now,
        })
      );
      this.seatRepository.deleteHold(order.rutaId, order.fecha, asiento);
      reservas.push({
        asiento,
        estado: 'reservado',
        reservedAt: now,
        nota: 'El bloqueo había expirado, pero el asiento seguía libre y el pago fue válido',
      });
    });

    return { reservas, conflictos };
  }
}
