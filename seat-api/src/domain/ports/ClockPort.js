/**
 * Puerto de salida: el tiempo.
 *
 * Inyectar el reloj permite probar la expiración de holds sin esperar diez
 * minutos reales: en los tests se sustituye por un reloj que avanza a voluntad.
 */
export class SystemClock {
  now() {
    return Date.now();
  }
}
