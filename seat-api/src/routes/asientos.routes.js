import express from 'express';
import {
  getAvailableSeats,
  getViewModel,
  createHold,
  getHolds,
  releaseHold,
  confirmReservation,
} from '../controllers/asientos.controller.js';

const router = express.Router();

/**
 * @swagger
 * /api/asientos/disponibles:
 *   get:
 *     summary: Obtiene asientos disponibles
 *     parameters:
 *       - in: query
 *         name: rutaId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: fecha
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Lista de asientos disponibles
 *       400:
 *         description: Parámetros faltantes
 */
router.get('/disponibles', getAvailableSeats);

/**
 * @swagger
 * /api/asientos/view-model:
 *   get:
 *     summary: View Model completo del mapa de asientos para la UI
 *     description: >
 *       Endpoint unificado que reemplaza las llamadas paralelas a /disponibles + /holds.
 *       Retorna todos los asientos con estado: disponible | en_hold | miHold | ocupado.
 *       Pasar userId para identificar los holds propios del usuario.
 *     parameters:
 *       - in: query
 *         name: rutaId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: fecha
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: userId
 *         required: false
 *         schema:
 *           type: string
 *         description: ID del usuario para marcar sus propios holds como 'miHold'
 *     responses:
 *       200:
 *         description: View Model completo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 rutaId:
 *                   type: string
 *                 fecha:
 *                   type: string
 *                 totalAsientos:
 *                   type: number
 *                 asientos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       numero:
 *                         type: number
 *                       estado:
 *                         type: string
 *                         enum: [disponible, en_hold, miHold, ocupado]
 *                       holdId:
 *                         type: string
 *                         nullable: true
 *                       expiresAt:
 *                         type: number
 *                         nullable: true
 *                       remainingMs:
 *                         type: number
 *                         nullable: true
 *                 resumen:
 *                   type: object
 *       400:
 *         description: Parámetros faltantes
 */
router.get('/view-model', getViewModel);

/**
 * @swagger
 * /api/asientos/reservar:
 *   post:
 *     summary: Crea un hold para un asiento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rutaId:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date
 *               asiento:
 *                 type: number
 *               userId:
 *                 type: string
 *             required:
 *               - rutaId
 *               - fecha
 *               - asiento
 *               - userId
 *     responses:
 *       201:
 *         description: Hold creado exitosamente
 *       409:
 *         description: Asiento ya está ocupado o tiene hold activo
 */
router.post('/reservar', createHold);

/**
 * @swagger
 * /api/asientos/holds:
 *   get:
 *     summary: Obtiene lista de holds activos
 *     responses:
 *       200:
 *         description: Lista de holds activos con tiempo restante
 */
router.get('/holds', getHolds);

/**
 * @swagger
 * /api/asientos/holds:
 *   delete:
 *     summary: Libera un hold manualmente
 *     description: Acepta holdId (preferido) o la combinación rutaId+fecha+asiento.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               holdId:
 *                 type: string
 *                 description: Preferido. ID único del hold a liberar.
 *               rutaId:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date
 *               asiento:
 *                 type: number
 *     responses:
 *       200:
 *         description: Hold liberado exitosamente
 *       409:
 *         description: Hold no encontrado
 */
router.delete('/holds', releaseHold);

/**
 * @swagger
 * /api/asientos/reservar-definitivo:
 *   post:
 *     summary: Confirma una reserva (convierte hold a reserved)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rutaId:
 *                 type: string
 *               fecha:
 *                 type: string
 *                 format: date
 *               asiento:
 *                 type: number
 *               holdId:
 *                 type: string
 *             required:
 *               - rutaId
 *               - fecha
 *               - asiento
 *               - holdId
 *     responses:
 *       200:
 *         description: Reserva confirmada exitosamente
 *       409:
 *         description: Hold no encontrado o inválido
 */
router.post('/reservar-definitivo', confirmReservation);

export default router;
