/**
 * Errores del núcleo de dominio.
 *
 * El dominio no conoce HTTP. Expone un `code` semántico y el adaptador HTTP
 * decide el status (ver infrastructure/http/middlewares/errorHandler.js).
 */

export class DomainError extends Error {
  constructor(message, code = 'DOMAIN_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

/** Datos de entrada inválidos según las reglas de negocio. */
export class ValidationError extends DomainError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR', details);
  }
}

/** La entidad solicitada no existe. */
export class NotFoundError extends DomainError {
  constructor(message, details = null) {
    super(message, 'NOT_FOUND', details);
  }
}

/** El estado actual impide la operación (asiento tomado, hold expirado...). */
export class ConflictError extends DomainError {
  constructor(message, details = null) {
    super(message, 'CONFLICT', details);
  }
}

/** Falló un sistema externo (PayPal, red...). */
export class GatewayError extends DomainError {
  constructor(message, details = null) {
    super(message, 'GATEWAY_ERROR', details);
  }
}
