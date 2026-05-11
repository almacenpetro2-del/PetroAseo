/**
 * Filtros al navegar desde Indicadores → Operaciones / Mantenimientos (SPA, sessionStorage).
 */
const STORAGE_KEY = 'petro_aseo_mant_nav_filtros';

/**
 * @param {Record<string, unknown>} filtros
 */
export function guardarFiltrosMantenimiento(filtros) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filtros || {}));
}

/**
 * Lee y elimina los filtros guardados (un solo uso).
 * @returns {Record<string, unknown>|null}
 */
export function consumirFiltrosMantenimiento() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
