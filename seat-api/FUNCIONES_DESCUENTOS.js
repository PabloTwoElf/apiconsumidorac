/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║         FUNCIÓN DE CÁLCULO DE DESCUENTOS - API ASIENTOS       ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

// Configuración de precios
const PRICE_CONFIG = {
  BASE_PRICE: 50000,        // Precio base por asiento
  DISCOUNTS: {
    2: 0.05,                // 5% descuento por 2 asientos
    3: 0.07,                // 7% descuento por 3 asientos
    4: 0.10,                // 10% descuento por 4+ asientos
  },
};

/**
 * FUNCIÓN PRINCIPAL: calculatePrice(quantity)
 * 
 * Calcula el precio total con descuentos en cascada
 * 
 * @param {number} quantity - Cantidad de asientos a comprar
 * @returns {Object} Objeto con detalles del cálculo
 * 
 * REGLAS DE DESCUENTO:
 * ├─ 1 asiento    → NO hay descuento (0%)
 * ├─ 2 asientos   → 5% descuento
 * ├─ 3 asientos   → 7% descuento
 * └─ 4+ asientos  → 10% descuento
 * 
 * EJEMPLO:
 * calculatePrice(3)
 * 
 * Resultado:
 * {
 *   quantity: 3,
 *   basePrice: 50000,
 *   baseTotal: 150000,        // 50000 × 3
 *   discountPercent: 7,       // 7% de descuento
 *   discountAmount: 10500,    // 150000 × 0.07
 *   total: 139500,            // 150000 - 10500
 *   savings: "Ahorras: $10500"
 * }
 */
export const calculatePrice = (quantity) => {
  // Validación
  if (quantity < 1) {
    throw new Error("La cantidad debe ser mayor a 0");
  }

  // 1. Calcular subtotal (sin descuento)
  const baseTotal = PRICE_CONFIG.BASE_PRICE * quantity;

  // 2. Determinar porcentaje de descuento según cantidad
  let discount = 0;
  let discountPercent = 0;

  if (quantity >= 4) {
    discount = baseTotal * PRICE_CONFIG.DISCOUNTS[4];
    discountPercent = 10;
  } else if (quantity >= 3) {
    discount = baseTotal * PRICE_CONFIG.DISCOUNTS[3];
    discountPercent = 7;
  } else if (quantity >= 2) {
    discount = baseTotal * PRICE_CONFIG.DISCOUNTS[2];
    discountPercent = 5;
  } else {
    discountPercent = 0;
  }

  // 3. Calcular total final
  const total = baseTotal - discount;

  // 4. Crear mensaje de ahorros
  const savings = discount > 0 
    ? `Ahorras: $${Math.round(discount)}`
    : '';

  // 5. Retornar objeto con todos los detalles
  return {
    quantity,
    basePrice: PRICE_CONFIG.BASE_PRICE,
    baseTotal,
    discountPercent,
    discountAmount: Math.round(discount),
    total: Math.round(total),
    savings,
  };
};

/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║                    CASOS DE USO                               ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

// CASO 1: Un asiento (sin descuento)
// calculatePrice(1)
// → total: 50000, descuento: 0%

// CASO 2: Dos asientos (5% descuento)
// calculatePrice(2)
// → baseTotal: 100000
// → descuento: 5000 (5%)
// → total: 95000

// CASO 3: Tres asientos (7% descuento)
// calculatePrice(3)
// → baseTotal: 150000
// → descuento: 10500 (7%)
// → total: 139500

// CASO 4: Cuatro asientos (10% descuento)
// calculatePrice(4)
// → baseTotal: 200000
// → descuento: 20000 (10%)
// → total: 180000

// CASO 5: Cinco asientos (10% descuento, máximo)
// calculatePrice(5)
// → baseTotal: 250000
// → descuento: 25000 (10%)
// → total: 225000
