/**
 * Constantes y utilidades compartidas del módulo OPERACIONES (Storage + tablas).
 */

/** Identificador del bucket en Supabase Storage. */
export const BUCKET_OPERACIONES = 'operaciones';

/** Límite de tamaño de archivo: 10 MB. */
export const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

/**
 * Escapa texto para uso seguro en plantillas HTML.
 * @param {string|number|null|undefined} t Texto bruto
 * @returns {string} HTML escapado
 */
export function escHtml(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Normaliza un fragmento de nombre de archivo para rutas en Storage.
 * @param {string} name Nombre original
 * @returns {string} Segmento seguro
 */
export function segmentoArchivoSeguro(name) {
  return String(name || 'archivo')
    .replace(/[^\w.\-]+/g, '_')
    .slice(0, 180);
}

/**
 * Obtiene extensión en minúsculas sin punto.
 * @param {string} fileName Nombre de archivo
 * @returns {string} Extensión
 */
export function extensionMinuscula(fileName) {
  const i = String(fileName || '').lastIndexOf('.');
  if (i < 0) return '';
  return String(fileName)
    .slice(i + 1)
    .toLowerCase();
}
