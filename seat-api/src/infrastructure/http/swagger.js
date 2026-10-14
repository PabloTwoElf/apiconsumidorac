import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Especificación OpenAPI generada desde los comentarios @swagger de las rutas.
 *
 * Las rutas de los archivos se resuelven desde este módulo y no desde el
 * directorio de trabajo: en Vercel el cwd de la función no es la raíz del
 * proyecto, y un glob relativo produciría una especificación vacía.
 *
 * Si el escaneo falla (por ejemplo si el empaquetador no conservara los
 * archivos), se devuelve una especificación mínima en lugar de romper el
 * arranque: /api-docs es documentación, no debe tumbar el API.
 */
export const buildSwaggerSpec = ({ publicBaseUrl, logger = console }) => {
  const definition = {
    openapi: '3.0.0',
    info: {
      title: 'CulturalTrip · Seat API',
      version: '2.0.0',
      description: [
        'API de disponibilidad de asientos con bloqueos temporales (holds), reservas',
        'confirmadas y pasarela de pago PayPal Sandbox orquestada de extremo a extremo.',
        '',
        '**Arquitectura:** hexagonal (puertos y adaptadores) con MVC en la capa HTTP.',
        '',
        '**Flujo de compra completo:**',
        '1. `POST /api/asientos/reservar` → devuelve `holdIds`',
        '2. `POST /api/checkout/crear-orden` → devuelve `orderId` y `approvalUrl`',
        '3. El comprador aprueba en PayPal',
        '4. `POST /api/checkout/capturar-orden` → cobra y confirma los asientos',
        '',
        `**Panel visual de despliegue:** [${publicBaseUrl}](${publicBaseUrl})`,
      ].join('\n'),
      contact: { name: 'CulturalTrip' },
    },
    servers: [{ url: publicBaseUrl, description: 'Servidor activo' }],
    tags: [
      { name: 'Asientos', description: 'Disponibilidad, bloqueos y reservas' },
      { name: 'Checkout PayPal', description: 'Orquestación de pagos con PayPal Sandbox' },
      { name: 'Reportes', description: 'Indicadores de venta para el tablero gerencial' },
      { name: 'Sistema', description: 'Salud y diagnóstico del despliegue' },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            ok: { type: 'boolean', example: false },
            error: { type: 'string', example: 'rutaId y fecha son parámetros obligatorios' },
            code: {
              type: 'string',
              enum: ['VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'GATEWAY_ERROR', 'INTERNAL_ERROR'],
            },
            details: { type: 'object', nullable: true },
          },
        },
      },
    },
  };

  try {
    const spec = swaggerJsdoc({
      definition,
      apis: [
        path.join(here, 'routes', '*.js'),
        path.join(here, '..', '..', 'infrastructure', 'http', 'routes', '*.js'),
      ],
    });

    if (!spec.paths || Object.keys(spec.paths).length === 0) {
      logger.warn('[swagger] No se encontraron anotaciones de rutas; se publica la especificación base.');
    }
    return spec;
  } catch (error) {
    logger.warn(`[swagger] No se pudo generar la especificación completa: ${error.message}`);
    return { ...definition, paths: {} };
  }
};
