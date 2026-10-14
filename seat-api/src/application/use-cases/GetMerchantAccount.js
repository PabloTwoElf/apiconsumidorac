/**
 * Caso de uso: estado de la cuenta de comercio en la pasarela.
 *
 * Es la vista "de administrador": saldo liquidado, movimientos y comisiones.
 * Complementa al informe de ventas, que mide lo facturado; aquí se ve lo que
 * realmente entró en la cuenta, que no es lo mismo — PayPal retiene una parte
 * temporalmente y cobra comisión por cada operación.
 *
 * Los dos bloques se piden en paralelo y cada uno falla por separado: que el
 * informe de transacciones no esté disponible (en sandbox tarda horas en
 * poblarse) no debe impedir ver el saldo.
 */
export class GetMerchantAccount {
  constructor({ paymentGateway }) {
    this.paymentGateway = paymentGateway;
  }

  async execute({ dias = 30, incluirMovimientos = true } = {}) {
    const [saldo, transacciones] = await Promise.allSettled([
      this.paymentGateway.getBalances(),
      incluirMovimientos ? this.paymentGateway.searchTransactions({ dias }) : Promise.resolve(null),
    ]);

    return {
      pasarela: this.paymentGateway.describe(),

      saldo:
        saldo.status === 'fulfilled'
          ? saldo.value
          : { error: saldo.reason?.message ?? 'No disponible', saldos: [] },

      movimientos:
        transacciones.status === 'fulfilled'
          ? transacciones.value
          : {
              error: transacciones.reason?.message ?? 'No disponible',
              total: 0,
              movimientos: [],
              // Causa habitual en sandbox, para no perder tiempo buscando.
              nota:
                'El informe de transacciones de PayPal tarda en poblarse en sandbox. ' +
                'Requiere además el permiso "Transaction Search" activado en la aplicación.',
            },
    };
  }
}
