/**
 * Filtros al navegar desde Indicadores → Logística / Productos (SPA, sessionStorage).
 */
const STORAGE_KEY = 'petro_aseo_log_nav_filtros';

/**
 * @param {string} nombreProducto
 */
export function guardarFiltroProducto(nombreProducto) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ nombre: nombreProducto || '' }));
}

/**
 * Lee y elimina el filtro guardado (un solo uso).
 * @returns {{ nombre: string }|null}
 */
export function consumirFiltroProducto() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
