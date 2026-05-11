/**
 * Registro global de instancias Chart.js para destruirlas al cambiar de vista.
 */
const registry = new Map();

/**
 * Obtiene el constructor Chart desde window (CDN).
 */
function getChartCtor() {
  const Chart = window.Chart;
  if (!Chart) throw new Error('Chart.js no está cargado');
  return Chart;
}

/**
 * Crea un gráfico de barras y lo registra para su posterior destrucción.
 * @param {HTMLCanvasElement} canvas Elemento canvas
 * @param {string} id Identificador único del gráfico en esta vista
 * @param {object} config Configuración compatible con Chart.js v3+
 */
export function crearBarChart(canvas, id, config) {
  if (!canvas) return null;
  destruirSiExiste(id);
  const Chart = getChartCtor();
  const instance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    ...config,
  });
  registry.set(id, instance);
  return instance;
}

/**
 * Barras horizontales (eje Y = categorías, eje X = valores).
 * @param {HTMLCanvasElement} canvas Elemento canvas
 * @param {string} id Identificador único
 * @param {object} config Configuración Chart.js (data + options; se fuerza indexAxis: 'y')
 */
export function crearBarChartHorizontal(canvas, id, config) {
  if (!canvas) return null;
  destruirSiExiste(id);
  const Chart = getChartCtor();
  const mergedOptions = {
    indexAxis: 'y',
    ...(config.options || {}),
  };
  const instance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    ...config,
    options: mergedOptions,
  });
  registry.set(id, instance);
  return instance;
}

/**
 * Crea un gráfico de líneas.
 */
export function crearLineChart(canvas, id, config) {
  if (!canvas) return null;
  destruirSiExiste(id);
  const Chart = getChartCtor();
  const instance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    ...config,
  });
  registry.set(id, instance);
  return instance;
}

/**
 * Crea un gráfico tipo doughnut (dona).
 */
export function crearDoughnutChart(canvas, id, config) {
  if (!canvas) return null;
  destruirSiExiste(id);
  const Chart = getChartCtor();
  const instance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    ...config,
  });
  registry.set(id, instance);
  return instance;
}

/**
 * Destruye un gráfico por id si existe.
 * @param {string} id Identificador
 */
export function destruirSiExiste(id) {
  const prev = registry.get(id);
  if (prev) {
    prev.destroy();
    registry.delete(id);
  }
}

/**
 * Destruye todos los gráficos registrados (útil al salir del módulo indicadores).
 */
export function destruirTodosLosCharts() {
  for (const [, chart] of registry) {
    chart.destroy();
  }
  registry.clear();
}
