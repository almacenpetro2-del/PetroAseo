/**
 * Devuelve true si el texto no está vacío tras trim.
 * @param {string} valor Cadena a evaluar
 */
export function requerido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0;
}

/**
 * Valida email simple para login/registro con Auth.
 * @param {string} email Correo o usuario tipo email
 */
export function esEmailValido(email) {
  if (!requerido(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Convierte entrada a entero positivo o NaN.
 * @param {string|number} valor Valor de formulario
 */
export function enteroPositivo(valor) {
  const n = Number.parseInt(String(valor), 10);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

/**
 * Formatea fecha yyyy-mm-dd para mostrar dd/mm/yyyy.
 * @param {string} iso Fecha ISO o yyyy-mm-dd
 */
export function formatearFecha(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}
