import express from 'express';
import {
  getAvailableSeats,
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
 *             required:
 *               - rutaId
 *               - fecha
 *               - asiento
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
