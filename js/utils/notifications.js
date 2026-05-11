/**
 * Muestra un mensaje tipo toast en la esquina inferior.
 * @param {string} mensaje Texto a mostrar
 * @param {'ok'|'error'|'info'} tipo Estilo visual
 * @param {number} duracionMs Tiempo visible en milisegundos
 */
export function mostrarToast(mensaje, tipo = 'info', duracionMs = 3800) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.className = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${tipo}`;
  el.textContent = mensaje;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--visible'));
  window.setTimeout(() => {
    el.classList.remove('toast--visible');
    window.setTimeout(() => el.remove(), 300);
  }, duracionMs);
}

/**
 * Alias semántico para operaciones exitosas.
 */
export function notifyOk(mensaje) {
  mostrarToast(mensaje, 'ok');
}

/**
 * Alias para errores o validaciones fallidas.
 */
export function notifyError(mensaje) {
  mostrarToast(mensaje, 'error', 5200);
}
