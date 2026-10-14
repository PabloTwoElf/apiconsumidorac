/**
 * Solo autoprefixer: añade los prefijos de `backdrop-filter`, que Safari
 * todavía necesita para el efecto cristal.
 *
 * Se retiró Tailwind: el proyecto tenía a la vez clases de utilidad y CSS
 * suelto, y dos sistemas compitiendo era justo lo que hacía inconsistente la
 * interfaz. Ahora todo sale de los tokens de src/styles/tokens.css.
 */
export default {
  plugins: {
    autoprefixer: {},
  },
};
