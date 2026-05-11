/**
 * Exporta filas a archivo Excel (.xlsx) usando SheetJS expuesto en window.XLSX.
 * @param {string} nombreArchivo Sin extensión
 * @param {string} nombreHoja Nombre de la pestaña
 * @param {Array<Record<string, unknown>>} filas Objetos planos por fila
 */
export function exportarExcel(nombreArchivo, nombreHoja, filas) {
  const XLSX = window.XLSX;
  if (!XLSX || typeof XLSX.utils.json_to_sheet !== 'function') {
    throw new Error('SheetJS no está cargado');
  }
  const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ INFO: 'SIN DATOS' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja.slice(0, 31));
  XLSX.writeFile(wb, `${nombreArchivo}.xlsx`);
}
