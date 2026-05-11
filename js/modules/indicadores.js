/**
 * Módulo INDICADORES — cuadros de mando (Mantenimiento, Logística, RRHH) con Chart.js.
 */
import { supabase } from '../supabase-client.js';
import { perfilActual, puedeVerModulo } from '../auth.js';
import { notifyError } from '../utils/notifications.js';
import {
  crearBarChart,
  crearBarChartHorizontal,
  crearDoughnutChart,
  destruirTodosLosCharts,
  destruirSiExiste,
} from '../utils/charts.js';
import { guardarFiltrosMantenimiento } from '../utils/mantenimiento-navegacion.js';
import { clasificarEquipoEstado, mesesDelAnioKeys, MESES_CORTO } from '../utils/mantenimiento-stats.js';

const MESES_NOMBRE = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const SECCIONES_POR_ROL = {
  admin: ['mantenimiento', 'logistica', 'rrhh', 'flota'],
  logistica: ['logistica'],
  rrhh: ['rrhh'],
  operaciones: ['mantenimiento', 'flota'],
};

function sumByKey(pairs) {
  const m = new Map();
  for (const { key, val } of pairs) m.set(key, (m.get(key) || 0) + val);
  return m;
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function eppCantidad(r) {
  const n = Number(r?.cantidad);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
}

const PALETA_HIDRO = ['#FF0000', '#1a1a2e', '#888888', '#444444', '#aaaaaa', '#666666', '#222222', '#cc0000', '#4a4a6a', '#990000', '#5c5c7a', '#b30000'];

function buildHidroGroupedDatasets(hidros) {
  const byH = new Map();
  for (const h of hidros || []) {
    const name = String(h.hidrolavadora || 'SIN NOMBRE').trim() || 'SIN NOMBRE';
    const prod = String(h.producto || 'SIN PRODUCTO').trim() || 'SIN PRODUCTO';
    const q = Number(h.cantidad) || 0;
    if (!byH.has(name)) byH.set(name, new Map());
    const pm = byH.get(name);
    pm.set(prod, (pm.get(prod) || 0) + q);
  }
  const hidroLabels = [...byH.keys()].sort((a, b) => a.localeCompare(b));
  if (!hidroLabels.length) {
    return { labels: ['SIN DATOS'], datasets: [{ label: '—', data: [0], backgroundColor: '#cccccc', borderColor: '#000', borderWidth: 1 }] };
  }
  const prodTotals = new Map();
  for (const h of hidroLabels) {
    const pm = byH.get(h);
    for (const [p, v] of pm) prodTotals.set(p, (prodTotals.get(p) || 0) + v);
  }
  const productosOrden = [...prodTotals.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const topProds = productosOrden.slice(0, 12);
  const datasets = topProds.map((prod, i) => ({
    label: prod.toUpperCase(),
    data: hidroLabels.map((hid) => byH.get(hid).get(prod) || 0),
    backgroundColor: PALETA_HIDRO[i % PALETA_HIDRO.length] + 'cc',
    borderColor: PALETA_HIDRO[i % PALETA_HIDRO.length],
    borderWidth: 1,
  }));
  return { labels: hidroLabels.map((x) => x.toUpperCase()), datasets };
}

function irAMantenimientosConFiltros(filtros) {
  guardarFiltrosMantenimiento(filtros);
  window.location.hash = '#/operaciones/mantenimientos';
}

function navLogistica() {
  window.location.hash = '#/logistica/productos';
}

function navHidro() {
  window.location.hash = '#/logistica/hidrolavadoras';
}

function navEpp() {
  window.location.hash = '#/logistica/epp';
}

function navRrhh() {
  window.location.hash = '#/rrhh';
}

/**
 * @param {HTMLElement} contenedor SPA
 */
export async function renderIndicadores(contenedor) {
  if (!puedeVerModulo(perfilActual.rol, 'indicadores')) {
    contenedor.innerHTML = '<p class="msg-denied">NO AUTORIZADO.</p>';
    return;
  }

  destruirTodosLosCharts();

  const rol = perfilActual.rol;
  const secciones = SECCIONES_POR_ROL[rol] || [];

  contenedor.innerHTML = `
    <section class="module module--wide">
      <h2 class="module__title">&#x1F4CA; INDICADORES</h2>

      ${secciones.includes('mantenimiento') ? `
      <div class="card chart-card chart-card--epp-ind ind-mant-section" aria-labelledby="ind-mant-h">
        <h3 id="ind-mant-h" class="sub-title chart-card--epp-ind__title">
          <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F527;</span>
          INDICADORES DE MANTENIMIENTO
        </h3>
        <p class="hint">CLIC EN BARRAS O EN LA DONA PARA ABRIR <strong>OPERACIONES &rarr; MANTENIMIENTOS</strong> CON FILTROS (SIN RECARGAR LA APP).</p>
        <div class="filters-bar ind-mant-filtros">
          <label>A&Ntilde;O<select id="ind-mant-anio" class="input-upper"></select></label>
          <label>SEDE<select id="ind-mant-sede" class="input-upper"><option value="">TODAS</option></select></label>
          <label>MARCA (TIPO)<input type="text" id="ind-mant-marca" class="input-upper" placeholder="TODAS" /></label>
          <button type="button" class="btn btn-primary" id="ind-mant-aplicar">APLICAR FILTROS</button>
        </div>
        <div class="ind-mant-charts">
          <div class="mant-chart-card">
            <h4>MANTENIMIENTOS POR MES</h4>
            <div class="mant-chart-wrap"><canvas id="ind-mant-meses"></canvas></div>
          </div>
          <div class="mant-chart-card">
            <h4>ESTADO DE EQUIPOS</h4>
            <div class="mant-chart-wrap"><canvas id="ind-mant-estado"></canvas></div>
          </div>
          <div class="mant-chart-card">
            <h4>EQUIPOS CON M&Aacute;S MANTENIMIENTOS CORRECTIVOS</h4>
            <div class="mant-chart-wrap"><canvas id="ind-mant-top"></canvas></div>
          </div>
        </div>
      </div>` : ''}

      ${secciones.includes('logistica') ? `
      <div class="card chart-card chart-card--epp-ind" aria-labelledby="ind-log-h" style="margin-top:1rem;">
        <h3 id="ind-log-h" class="sub-title chart-card--epp-ind__title">
          <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F4E6;</span>
          INDICADORES DE LOG&Iacute;STICA
        </h3>
        <p class="hint">CLIC EN GR&Aacute;FICOS PARA NAVEGAR AL M&Oacute;DULO CORRESPONDIENTE.</p>
        <div class="filters-bar ind-mant-filtros">
          <label>A&Ntilde;O<select id="ind-log-anio" class="input-upper"></select></label>
          <button type="button" class="btn btn-primary" id="ind-log-aplicar">APLICAR FILTROS</button>
        </div>
        <div class="indicadores-row-3">
          <div class="card chart-card chart-card--epp-ind">
            <h3 class="sub-title chart-card--epp-ind__title">
              <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F4CA;</span>
              CONSUMO POR HIDROLAVADORA
            </h3>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-hidro-grupo"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h3 class="sub-title chart-card--epp-ind__title">
              <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F4CA;</span>
              PRODUCTOS POR CATEGOR&Iacute;A
            </h3>
            <p class="indicadores-donut-total" id="ind-cat-total"></p>
            <div class="chart-card--epp-ind__plot chart-card--epp-ind__plot--donut"><canvas id="ch-donut-cat"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h3 class="sub-title chart-card--epp-ind__title">
              <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F4CA;</span>
              EPP &mdash; PRODUCTOS M&Aacute;S ENTREGADOS
            </h3>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-bar-epp-prod"></canvas></div>
          </div>
        </div>
      </div>` : ''}

      ${secciones.includes('rrhh') ? `
      <div class="card chart-card chart-card--epp-ind" aria-labelledby="ind-rrhh-h" style="margin-top:1rem;">
        <h3 id="ind-rrhh-h" class="sub-title chart-card--epp-ind__title">
          <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F465;</span>
          INDICADORES DE RECURSOS HUMANOS
        </h3>
        <div class="filters-bar ind-mant-filtros">
          <label>A&Ntilde;O<select id="ind-rrhh-anio" class="input-upper"></select></label>
          <label>&Aacute;REA<select id="ind-rrhh-area" class="input-upper"><option value="">TODAS</option><option value="Barrido">BARRIDO</option><option value="Lavado">LAVADO</option><option value="Conductor">CONDUCTOR</option><option value="Operaciones">OPERACIONES</option></select></label>
          <label>TURNO<select id="ind-rrhh-turno" class="input-upper"><option value="">TODOS</option><option value="Mañana">MA&Ntilde;ANA</option><option value="Tarde">TARDE</option><option value="Noche">NOCHE</option></select></label>
          <button type="button" class="btn btn-primary" id="ind-rrhh-aplicar">APLICAR FILTROS</button>
        </div>

        <div class="indicadores-row-kpis" style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1rem;">
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">TOTAL ACTIVOS</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-total-activos" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">CESES A&Ntilde;O</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-ceses-anio" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">TASA ROTACI&Oacute;N</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-rotacion" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">VAC. TOMADOS</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-vac-dias" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">INC. PEND.</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-inc-pend" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">DESC. ACTIVOS</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-dm-activos" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">ASISTENCIA HOY</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-asist-hoy" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">DESCANSOS HOY</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-desc-hoy" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
          <div class="card chart-card--epp-ind" style="flex:1;min-width:130px;text-align:center;padding:0.6rem;">
            <span style="font-size:0.65rem;font-weight:700;color:#666;">DESCANSOS SEMANA</span>
            <p class="indicadores-big-kpi" id="ind-rrhh-desc-semana" style="font-size:1.8rem;margin:0.2rem 0;">—</p>
          </div>
        </div>

        <div class="indicadores-row-3">
          <div class="card chart-card chart-card--epp-ind">
            <h4>DISTRIBUCIÓN POR ÁREA</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-area"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>DISTRIBUCIÓN POR TURNO</h4>
            <div class="chart-card--epp-ind__plot chart-card--epp-ind__plot--donut"><canvas id="ch-rrhh-turno"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>INGRESOS VS CESES MENSUALES</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-ingresos-ceses"></canvas></div>
          </div>
        </div>

        <div class="indicadores-row-3" style="margin-top:0.75rem;">
          <div class="card chart-card chart-card--epp-ind">
            <h4>CESES POR MOTIVO</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-ceses-motivo"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>VACACIONES — TOP DÍAS</h4>
            <p class="indicadores-big-kpi" id="ind-rrhh-vac-top-total"></p>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-vac-top"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>INCIDENCIAS POR TIPO Y GRAVEDAD</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-inc-tipo"></canvas></div>
          </div>
        </div>

        <div class="indicadores-row-3" style="margin-top:0.75rem;">
          <div class="card chart-card chart-card--epp-ind">
            <h4>DESCANSOS MÉDICOS POR MES</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-dm-mes"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>DESCANSOS — TOP DÍAS</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-dm-top"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>TASA DE ROTACIÓN MENSUAL</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-rotacion-mes"></canvas></div>
          </div>
        </div>

        <div class="indicadores-row-3" style="margin-top:0.75rem;">
          <div class="card chart-card chart-card--epp-ind">
            <h4>ASISTENCIA ÚLTIMOS 7 DÍAS</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-asist-7d"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>DESCANSOS PROGRAMADOS POR TURNO (MES)</h4>
            <div class="chart-card--epp-ind__plot chart-card--epp-ind__plot--donut"><canvas id="ch-rrhh-desc-turno"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>TOP AUSENTES DEL MES</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-rrhh-top-ausentes"></canvas></div>
          </div>
        </div>
      </div>` : ''}

      ${secciones.includes('flota') ? `
      <div class="card chart-card chart-card--epp-ind" aria-labelledby="ind-flota-h" style="margin-top:1rem;">
        <h3 id="ind-flota-h" class="sub-title chart-card--epp-ind__title">
          <span class="chart-card--epp-ind__title-icon" aria-hidden="true">&#x1F69B;</span>
          INDICADORES DE FLOTA
        </h3>
        <p class="hint">REFERENCIA: D&Iacute;A DE 6:00 AM A 5:59 AM.</p>
        <div class="filters-bar ind-mant-filtros">
          <label>DESDE<input type="date" id="ind-flota-desde" class="input-upper" /></label>
          <label>HASTA<input type="date" id="ind-flota-hasta" class="input-upper" /></label>
          <label>VEH&Iacute;CULO<select id="ind-flota-vehiculo" class="input-upper"><option value="">TODOS</option></select></label>
          <button type="button" class="btn btn-primary" id="ind-flota-aplicar">APLICAR FILTROS</button>
        </div>
        <div class="indicadores-row-3">
          <div class="card chart-card chart-card--epp-ind">
            <h4>PESO POR VEH&Iacute;CULO</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-flota-peso"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>HORAS POR VEH&Iacute;CULO</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-flota-horas"></canvas></div>
          </div>
          <div class="card chart-card chart-card--epp-ind">
            <h4>VIAJES DIARIOS</h4>
            <div class="chart-card--epp-ind__plot"><canvas id="ch-flota-viajes"></canvas></div>
          </div>
        </div>
      </div>` : ''}
    </section>`;

  contenedor._seccionesIndicadores = secciones;
  const yActual = new Date().getFullYear();

  if (secciones.includes('mantenimiento')) {
    const anioSel = contenedor.querySelector('#ind-mant-anio');
    for (let y = yActual; y >= yActual - 5; y--) {
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = String(y);
      anioSel.appendChild(o);
    }
    anioSel.value = String(yActual);

    contenedor.querySelector('#ind-mant-aplicar')?.addEventListener('click', () => {
      try {
        pintarIndicadoresMantenimiento(contenedor);
      } catch (err) {
        console.error(err);
        notifyError('ERROR AL ACTUALIZAR INDICADORES DE MANTENIMIENTO.');
      }
    });
  }

  if (secciones.includes('logistica')) {
    const selLog = contenedor.querySelector('#ind-log-anio');
    if (selLog) {
      for (let y = yActual; y >= yActual - 5; y--) {
        const o = document.createElement('option');
        o.value = String(y);
        o.textContent = String(y);
        selLog.appendChild(o);
      }
      selLog.value = String(yActual);
    }
    contenedor.querySelector('#ind-log-aplicar')?.addEventListener('click', () => {
      try { pintarIndLogistica(contenedor); } catch (err) { console.error(err); }
    });
  }

  if (secciones.includes('rrhh')) {
    const selRrhh = contenedor.querySelector('#ind-rrhh-anio');
    if (selRrhh) {
      for (let y = yActual; y >= yActual - 5; y--) {
        const o = document.createElement('option');
        o.value = String(y);
        o.textContent = String(y);
        selRrhh.appendChild(o);
      }
      selRrhh.value = String(yActual);
    }
    contenedor.querySelector('#ind-rrhh-aplicar')?.addEventListener('click', () => {
      pintarIndRrhh(contenedor);
    });
    contenedor.querySelector('#ind-rrhh-area')?.addEventListener('change', () => {
      pintarIndRrhh(contenedor);
    });
    contenedor.querySelector('#ind-rrhh-turno')?.addEventListener('change', () => {
      pintarIndRrhh(contenedor);
    });
  }

  if (secciones.includes('flota')) {
    const hoy = new Date().toISOString().slice(0, 10);
    contenedor.querySelector('#ind-flota-desde').value = hoy;
    contenedor.querySelector('#ind-flota-hasta').value = hoy;

    try {
      const { data: vehiculosFlota } = await supabase.from('flota_vehiculos').select('id, placa').order('placa');
      const selVeh = contenedor.querySelector('#ind-flota-vehiculo');
      for (const v of (vehiculosFlota || [])) {
        const o = document.createElement('option');
        o.value = v.id;
        o.textContent = v.placa;
        selVeh.appendChild(o);
      }
    } catch (_) {}

    contenedor.querySelector('#ind-flota-aplicar')?.addEventListener('click', () => {
      pintarIndicadoresFlota(contenedor).catch((err) => {
        console.error(err);
        notifyError('ERROR AL ACTUALIZAR INDICADORES DE FLOTA.');
      });
    });
  }

  await pintarTodo(contenedor);

  if (secciones.includes('flota')) {
    pintarIndicadoresFlota(contenedor).catch((err) => {
      console.error(err);
      notifyError('ERROR AL CARGAR INDICADORES DE FLOTA.');
    });
  }
}

async function pintarTodo(root) {
  destruirTodosLosCharts();
  const secciones = root._seccionesIndicadores || [];

  const promesas = [];

  if (secciones.includes('logistica')) {
    promesas.push(
      supabase.from('productos').select('*'),
      supabase.from('epp_herramientas').select('*'),
      supabase.from('hidrolavadoras').select('*'),
    );
  }

  if (secciones.includes('rrhh')) {
    promesas.push(
      supabase.from('personal_activo').select('*'),
      supabase.from('personal_cesado').select('*'),
      supabase.from('vacaciones').select('*'),
      supabase.from('incidencias').select('*'),
      supabase.from('descansos_medicos').select('*'),
      supabase.from('asistencia').select('*'),
      supabase.from('programacion_descansos').select('*'),
    );
  }

  if (secciones.includes('mantenimiento')) {
    promesas.push(
      supabase.from('mant_equipos').select('*'),
      supabase.from('mant_planes').select('*'),
      supabase.from('mant_actividades_plan').select('*'),
      supabase.from('mant_correctivos').select('*'),
    );
  }

  if (!promesas.length) return;

  const resultados = await Promise.all(promesas);
  let i = 0;

  if (secciones.includes('logistica')) {
    const productos = resultados[i++];
    const eppRows = resultados[i++];
    const hidros = resultados[i++];

    if (productos.error) throw productos.error;
    if (eppRows.error) throw eppRows.error;
    if (hidros.error) throw hidros.error;

    root._logCache = { hidros: hidros.data || [], productos: productos.data || [], epp: eppRows.data || [] };

    pintarHidroGrupo(root, root._logCache.hidros);
    pintarDonutCategorias(root, root._logCache.productos);
    pintarEppEntregas(root, root._logCache.epp);
  }

  if (secciones.includes('rrhh')) {
    const personalActivo = resultados[i++];
    const personalCesado = resultados[i++];
    const vacaciones = resultados[i++];
    const incidencias = resultados[i++];
    const descansosMedicos = resultados[i++];
    const asistencia = resultados[i++];
    const programacionDescansos = resultados[i++];

    if (personalActivo.error) throw personalActivo.error;
    if (personalCesado.error) throw personalCesado.error;
    if (vacaciones.error) throw vacaciones.error;
    if (incidencias.error) throw incidencias.error;
    if (descansosMedicos.error) throw descansosMedicos.error;

    root._rrhhCache = {
      activos: personalActivo.data || [],
      cesados: personalCesado.data || [],
      vacaciones: vacaciones.data || [],
      incidencias: incidencias.data || [],
      descansos: descansosMedicos.data || [],
      asistencia: asistencia.data || [],
      progDescansos: programacionDescansos.data || [],
    };

    pintarIndRrhh(root);
  }

  if (secciones.includes('mantenimiento')) {
    const mantEquipos = resultados[i++];
    const mantPlanes = resultados[i++];
    const mantActividades = resultados[i++];
    const mantCorrectivos = resultados[i++];

    if (mantEquipos.error) throw mantEquipos.error;
    if (mantPlanes.error) throw mantPlanes.error;
    if (mantActividades.error) throw mantActividades.error;
    if (mantCorrectivos.error) throw mantCorrectivos.error;

    root._mantDataCache = {
      equipos: mantEquipos.data || [],
      planes: mantPlanes.data || [],
      actividades: mantActividades.data || [],
      correctivos: mantCorrectivos.data || [],
    };

    poblarIndMantSedes(root, root._mantDataCache.equipos);
    pintarIndicadoresMantenimiento(root);
  }
}

function pintarHidroGrupo(root, hidros) {
  const canvas = root.querySelector('#ch-hidro-grupo');
  const { labels, datasets } = buildHidroGroupedDatasets(hidros);
  crearBarChart(canvas, 'hidro-grupo', {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: () => navHidro(),
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: '700' } } },
        tooltip: {
          bodyFont: { weight: '700', size: 11 },
          callbacks: {
            title(items) { return String(items[0]?.label ?? '').toUpperCase(); },
          },
        },
      },
      scales: {
        x: { stacked: false, ticks: { maxRotation: 45, minRotation: 0, font: { weight: '700', size: 10 } } },
        y: { beginAtZero: true, stacked: false, ticks: { font: { weight: '700', size: 10 } } },
      },
    },
  });
}

function pintarDonutCategorias(root, productos) {
  const catMap = sumByKey(productos.map((p) => ({ key: p.categoria || 'SIN CATEGORÍA', val: 1 })));
  let labels = [...catMap.keys()].map((k) => k.toUpperCase());
  let values = [...catMap.values()];
  if (!labels.length) { labels = ['SIN PRODUCTOS']; values = [1]; }
  const totalProd = productos.length;
  const sumVals = values.reduce((a, b) => a + b, 0) || 1;
  root.querySelector('#ind-cat-total').textContent = `TOTAL: ${totalProd} PRODUCTOS`;

  crearDoughnutChart(root.querySelector('#ch-donut-cat'), 'donut-cat', {
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: ['#FF0000', '#1a1a2e', '#888888', '#444444', '#aaaaaa', '#222222'] }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: () => navLogistica(),
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 10, weight: '700' },
            generateLabels(chart) {
              const data = chart.data;
              if (!data.labels?.length || !data.datasets?.[0]?.data) return [];
              const ds = data.datasets[0].data;
              return data.labels.map((label, i) => {
                const v = Number(ds[i]) || 0;
                const pct = Math.round((v / sumVals) * 100);
                return { text: `${label}  ${v}  (${pct}%)`, fillStyle: Array.isArray(data.datasets[0].backgroundColor) ? data.datasets[0].backgroundColor[i % 6] : '#ccc', hidden: false, index: i };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = Number(ctx.raw) || 0;
              const pct = Math.round((v / sumVals) * 100);
              return `${ctx.label}: ${v} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function pintarEppEntregas(root, eppRows) {
  const byProd = sumByKey(eppRows.map((r) => ({ key: r.producto || 'SIN PRODUCTO', val: eppCantidad(r) })));
  let topProd = [...byProd.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!topProd.length) topProd = [['SIN DATOS', 0]];
  const valsProd = topProd.map(([, v]) => v);
  const maxProd = Math.max(0, ...valsProd);
  const xMaxProd = maxProd <= 0 ? 2 : Math.max(2, maxProd * 1.08);

  crearBarChartHorizontal(root.querySelector('#ch-bar-epp-prod'), 'bar-epp-prod', {
    data: {
      labels: topProd.map(([k]) => String(k).toUpperCase()),
      datasets: [{ label: 'UNIDADES ENTREGADAS', data: valsProd, backgroundColor: '#FF0000', borderColor: '#FF0000', borderWidth: 1, maxBarThickness: 22 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 320, easing: 'easeOutQuad' },
      onClick: () => navEpp(),
      plugins: {
        legend: { display: false },
        tooltip: {
          bodyFont: { weight: '700', size: 11 },
          callbacks: {
            title(items) { return String(items[0]?.label ?? '').toUpperCase(); },
            label(ctx) {
              const v = ctx.parsed?.x;
              const n = typeof v === 'number' ? String(Math.round(v)) : (v ?? '');
              return `${String(ctx.dataset.label || '').toUpperCase()}: ${n}`;
            },
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true, max: xMaxProd,
          grid: { display: false, drawTicks: true },
          border: { color: '#000000', display: true },
          ticks: {
            color: '#000000', font: { size: 11, weight: '700', family: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' },
            callback(raw) { return typeof raw === 'number' ? String(Math.round(raw)) : raw; },
          },
        },
        y: {
          grid: { display: false, drawTicks: true },
          border: { color: '#000000', display: true },
          ticks: { color: '#000000', font: { size: 11, weight: '700' }, autoSkip: true, maxRotation: 0 },
        },
      },
    },
  });
}

function pintarIndRrhh(root) {
  const cache = root._rrhhCache;
  if (!cache) return;

  const anio = Number(root.querySelector('#ind-rrhh-anio')?.value) || new Date().getFullYear();
  const areaF = root.querySelector('#ind-rrhh-area')?.value || '';
  const turnoF = root.querySelector('#ind-rrhh-turno')?.value || '';

  const ids = [
    'ch-rrhh-area', 'ch-rrhh-turno', 'ch-rrhh-ingresos-ceses',
    'ch-rrhh-ceses-motivo', 'ch-rrhh-vac-top', 'ch-rrhh-inc-tipo',
    'ch-rrhh-dm-mes', 'ch-rrhh-dm-top', 'ch-rrhh-rotacion-mes',
    'ch-rrhh-asist-7d', 'ch-rrhh-desc-turno', 'ch-rrhh-top-ausentes',
  ];
  ids.forEach((id) => destruirSiExiste(id));

  const activos = cache.activos || [];
  const cesados = cache.cesados || [];
  const vacaciones = cache.vacaciones || [];
  const incidencias = cache.incidencias || [];
  const descansos = cache.descansos || [];
  const asistencia = cache.asistencia || [];
  const progDescansos = cache.progDescansos || [];

  const activosFilt = activos.filter((a) => {
    if (areaF && a.area !== areaF) return false;
    if (turnoF && a.turno !== turnoF) return false;
    return true;
  });

  const cesadosAnio = cesados.filter((c) => {
    if (!c.fecha_cese) return false;
    if (String(c.fecha_cese).slice(0, 4) !== String(anio)) return false;
    if (areaF && c.area !== areaF) return false;
    if (turnoF && c.turno !== turnoF) return false;
    return true;
  });

  const incsAnio = incidencias.filter((i) => {
    if (String(i.fecha_incidencia || '').slice(0, 4) !== String(anio)) return false;
    return true;
  });

  const vacsAnio = vacaciones.filter((v) => {
    if (String(v.fecha_salida || '').slice(0, 4) !== String(anio)) return false;
    return true;
  });

  const dmsAnio = descansos.filter((d) => {
    if (String(d.fecha_inicio || '').slice(0, 4) !== String(anio)) return false;
    return true;
  });

  const dmsActivos = dmsAnio.filter((d) => d.estado === 'Activo').length;
  const incsPend = incsAnio.filter((i) => i.estado === 'Pendiente').length;
  const totalCesadosAnio = cesadosAnio.length;
  const tasaRot = activosFilt.length + totalCesadosAnio > 0
    ? ((totalCesadosAnio / (activosFilt.length + totalCesadosAnio)) * 100).toFixed(1)
    : '0.0';
  const totalVacDias = vacsAnio.reduce((s, v) => s + (Number(v.dias_vacaciones) || 0), 0);

  root.querySelector('#ind-rrhh-total-activos').innerHTML = `<strong>${activosFilt.length}</strong>`;
  root.querySelector('#ind-rrhh-ceses-anio').innerHTML = `<strong>${totalCesadosAnio}</strong>`;
  root.querySelector('#ind-rrhh-rotacion').innerHTML = `<strong>${tasaRot}%</strong>`;
  root.querySelector('#ind-rrhh-vac-dias').innerHTML = `<strong>${totalVacDias}</strong>`;
  root.querySelector('#ind-rrhh-inc-pend').innerHTML = `<strong>${incsPend}</strong>`;
  root.querySelector('#ind-rrhh-dm-activos').innerHTML = `<strong>${dmsActivos}</strong>`;

  const hoy = new Date().toISOString().slice(0, 10);
  const asistHoy = asistencia.filter((a) => a.fecha === hoy);
  const totalAsistHoy = asistHoy.length;
  const presentesHoy = asistHoy.filter((a) => a.estado === 'Presente').length;
  const pctAsistHoy = totalAsistHoy > 0 ? Math.round((presentesHoy / totalAsistHoy) * 100) : 0;
  root.querySelector('#ind-rrhh-asist-hoy').innerHTML = `<strong>${pctAsistHoy}%</strong>`;
  root.querySelector('#ind-rrhh-asist-hoy').title = `${presentesHoy}/${totalAsistHoy}`;

  const descHoy = progDescansos.filter((d) => d.fecha_seleccionada === hoy && d.descansa).length;
  root.querySelector('#ind-rrhh-desc-hoy').innerHTML = `<strong>${descHoy}</strong>`;

  const inicioSemana = new Date();
  inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay() + 1);
  const finSemana = new Date(inicioSemana);
  finSemana.setDate(finSemana.getDate() + 6);
  const desdeS = inicioSemana.toISOString().slice(0, 10);
  const hastaS = finSemana.toISOString().slice(0, 10);
  const descSemana = progDescansos.filter((d) => d.fecha_seleccionada >= desdeS && d.fecha_seleccionada <= hastaS && d.descansa).length;
  root.querySelector('#ind-rrhh-desc-semana').innerHTML = `<strong>${descSemana}</strong>`;

  pintarRrhhArea(root, activosFilt);
  pintarRrhhTurno(root, activosFilt);
  pintarRrhhIngresosCeses(root, activos, cesados, anio, areaF, turnoF);
  pintarRrhhCesesMotivo(root, cesadosAnio);
  pintarRrhhVacTop(root, vacsAnio);
  pintarRrhhIncTipo(root, incsAnio);
  pintarRrhhDmMes(root, dmsAnio, anio);
  pintarRrhhDmTop(root, dmsAnio);
  pintarRrhhRotacionMes(root, activos, cesados, anio, areaF, turnoF);
  pintarRrhhAsist7d(root, asistencia, progDescansos, anio, areaF, turnoF);
  pintarRrhhDescTurno(root, progDescansos, anio);
  pintarRrhhTopAusentes(root, asistencia, anio);
}

function pintarRrhhArea(root, activos) {
  const orden = ['Barrido', 'Lavado', 'Conductor', 'Operaciones'];
  const byArea = sumByKey(activos.map((r) => ({ key: r.area || 'SIN ÁREA', val: 1 })));
  const labels = [];
  const data = [];
  for (const a of orden) {
    if (byArea.has(a)) { labels.push(a.toUpperCase()); data.push(byArea.get(a)); }
  }
  for (const [k, v] of [...byArea.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!orden.includes(k)) { labels.push(String(k).toUpperCase()); data.push(v); }
  }
  if (!labels.length) { labels.push('SIN DATOS'); data.push(0); }
  crearBarChart(root.querySelector('#ch-rrhh-area'), 'ch-rrhh-area', {
    data: {
      labels,
      datasets: [{ label: 'PERSONAL', data, backgroundColor: '#1a1a2eaa', borderColor: '#1a1a2e', borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function pintarRrhhTurno(root, activos) {
  const byTurno = sumByKey(activos.map((r) => ({ key: r.turno || 'SIN TURNO', val: 1 })));
  let labels = [...byTurno.keys()].map((k) => k.toUpperCase());
  let data = [...byTurno.values()];
  if (!labels.length) { labels = ['SIN DATOS']; data = [0]; }
  crearDoughnutChart(root.querySelector('#ch-rrhh-turno'), 'ch-rrhh-turno', {
    data: {
      labels,
      datasets: [{ data, backgroundColor: ['#1a1a2e', '#FF0000', '#FFC107', '#4CAF50'] }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10, weight: '700' } } } },
    },
  });
}

function pintarRrhhIngresosCeses(root, activos, cesados, anio, areaF, turnoF) {
  const ingMes = new Array(12).fill(0);
  const cesMes = new Array(12).fill(0);
  for (const a of activos) {
    if (!a.fecha_ingreso || String(a.fecha_ingreso).slice(0, 4) !== String(anio)) continue;
    if (areaF && a.area !== areaF) continue;
    if (turnoF && a.turno !== turnoF) continue;
    const m = new Date(a.fecha_ingreso).getMonth();
    if (m >= 0 && m < 12) ingMes[m]++;
  }
  for (const c of cesados) {
    if (!c.fecha_cese || String(c.fecha_cese).slice(0, 4) !== String(anio)) continue;
    if (areaF && c.area !== areaF) continue;
    if (turnoF && c.turno !== turnoF) continue;
    const m = new Date(c.fecha_cese).getMonth();
    if (m >= 0 && m < 12) cesMes[m]++;
  }
  const labels = MESES_NOMBRE.map((m) => `${m} ${anio}`);
  crearBarChart(root.querySelector('#ch-rrhh-ingresos-ceses'), 'ch-rrhh-ingresos-ceses', {
    data: {
      labels,
      datasets: [
        { label: 'INGRESOS', data: ingMes, backgroundColor: '#4CAF50', borderColor: '#4CAF50', borderWidth: 1 },
        { label: 'CESES', data: cesMes.map((v) => -v), backgroundColor: '#FF0000', borderColor: '#FF0000', borderWidth: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10, weight: '700' } } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = Math.abs(Number(ctx.raw) || 0);
              return `${ctx.dataset.label}: ${v}`;
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1, callback(v) { return Math.abs(v); } } },
        x: { ticks: { maxRotation: 45, font: { weight: '700', size: 9 } } },
      },
    },
  });
}

function pintarRrhhCesesMotivo(root, cesadosFilt) {
  const byMotivo = new Map();
  for (const c of cesadosFilt) {
    const m = (c.motivo || 'SIN MOTIVO').trim();
    if (m.length > 40) {
      byMotivo.set(m.slice(0, 40) + '…', (byMotivo.get(m.slice(0, 40) + '…') || 0) + 1);
    } else {
      byMotivo.set(m, (byMotivo.get(m) || 0) + 1);
    }
  }
  let entries = [...byMotivo.entries()].sort((a, b) => b[1] - a[1]);
  if (!entries.length) entries = [['SIN DATOS', 0]];
  crearBarChartHorizontal(root.querySelector('#ch-rrhh-ceses-motivo'), 'ch-rrhh-ceses-motivo', {
    data: {
      labels: entries.map(([k]) => String(k).toUpperCase()),
      datasets: [{ label: 'CESES', data: entries.map(([, v]) => v), backgroundColor: '#FF0000aa', borderColor: '#FF0000', borderWidth: 1, maxBarThickness: 18 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function pintarRrhhVacTop(root, vacs) {
  const byWorker = new Map();
  for (const v of vacs) {
    const key = v.nombre || v.nombres || 'SIN DATOS';
    byWorker.set(key, (byWorker.get(key) || 0) + (Number(v.dias_vacaciones) || 0));
  }
  let entries = [...byWorker.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const totalGlobal = entries.reduce((s, [, v]) => s + v, 0);
  root.querySelector('#ind-rrhh-vac-top-total').innerHTML = `<span class="indicadores-big-kpi__lbl">DÍAS TOTALES:</span> <strong>${totalGlobal}</strong>`;
  if (!entries.length) entries = [['SIN DATOS', 0]];
  crearBarChartHorizontal(root.querySelector('#ch-rrhh-vac-top'), 'ch-rrhh-vac-top', {
    data: {
      labels: entries.map(([k]) => String(k).toUpperCase()),
      datasets: [{ label: 'DÍAS', data: entries.map(([, v]) => v), backgroundColor: '#1a1a2eaa', borderColor: '#1a1a2e', borderWidth: 1, maxBarThickness: 18 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function pintarRrhhIncTipo(root, incs) {
  const byTipo = new Map();
  const byGravedad = new Map();
  for (const i of incs) {
    const tipo = i.tipo || 'SIN TIPO';
    byTipo.set(tipo, (byTipo.get(tipo) || 0) + 1);
    const grav = i.gravedad || 'SIN GRAVEDAD';
    byGravedad.set(grav, (byGravedad.get(grav) || 0) + 1);
  }
  let labels = [...byTipo.keys()];
  let data = [...byTipo.values()];
  if (!labels.length) { labels = ['SIN DATOS']; data = [0]; }
  const gravLabels = ['Leve', 'Grave', 'Muy grave'];
  const gravData = gravLabels.map((g) => byGravedad.get(g) || 0);
  const gravColors = ['#FFC107', '#FF9800', '#FF0000'];
  crearBarChart(root.querySelector('#ch-rrhh-inc-tipo'), 'ch-rrhh-inc-tipo', {
    data: {
      labels: labels.map((k) => String(k).toUpperCase()),
      datasets: [
        { label: 'CANTIDAD', data, backgroundColor: '#1a1a2eaa', borderColor: '#1a1a2e', borderWidth: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: {
        legend: { display: false },
      },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { maxRotation: 30, font: { weight: '700', size: 9 } } } },
    },
  });

  if (gravData.some((v) => v > 0)) {
    const gravCanvas = document.createElement('canvas');
    gravCanvas.id = 'ch-rrhh-inc-grav';
    const gravContainer = root.querySelector('#ch-rrhh-inc-tipo')?.parentElement;
    if (gravContainer) {
      gravContainer.style.display = 'flex';
      gravContainer.style.flexDirection = 'column';
      gravContainer.style.gap = '0.5rem';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'height:100px;flex-shrink:0;';
      wrapper.appendChild(gravCanvas);
      gravContainer.appendChild(wrapper);
      crearBarChart(gravCanvas, 'ch-rrhh-inc-grav', {
        data: {
          labels: gravLabels.map((k) => String(k).toUpperCase()),
          datasets: [{ label: 'GRAVEDAD', data: gravData, backgroundColor: gravColors, borderColor: gravColors, borderWidth: 1 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { font: { weight: '700', size: 9 } } } },
        },
      });
    }
  }
}

function pintarRrhhDmMes(root, dms, anio) {
  const byMonth = new Array(12).fill(0);
  for (const d of dms) {
    const m = new Date(d.fecha_inicio).getMonth();
    if (m >= 0 && m < 12) byMonth[m] += Number(d.dias_descanso) || 0;
  }
  const labels = MESES_NOMBRE.map((m) => `${m} ${anio}`);
  crearBarChart(root.querySelector('#ch-rrhh-dm-mes'), 'ch-rrhh-dm-mes', {
    data: {
      labels,
      datasets: [{ label: 'DÍAS', data: byMonth, backgroundColor: '#FF0000aa', borderColor: '#FF0000', borderWidth: 1 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } }, x: { ticks: { maxRotation: 45, font: { weight: '700', size: 9 } } } },
    },
  });
}

function pintarRrhhDmTop(root, dms) {
  const byWorker = new Map();
  for (const d of dms) {
    const key = d.nombre || d.nombres || 'SIN DATOS';
    byWorker.set(key, (byWorker.get(key) || 0) + (Number(d.dias_descanso) || 0));
  }
  let entries = [...byWorker.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) entries = [['SIN DATOS', 0]];
  crearBarChartHorizontal(root.querySelector('#ch-rrhh-dm-top'), 'ch-rrhh-dm-top', {
    data: {
      labels: entries.map(([k]) => String(k).toUpperCase()),
      datasets: [{ label: 'DÍAS', data: entries.map(([, v]) => v), backgroundColor: '#FF0000aa', borderColor: '#FF0000', borderWidth: 1, maxBarThickness: 18 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function pintarRrhhRotacionMes(root, activos, cesados, anio, areaF, turnoF) {
  const tasas = [];
  const labels = [];
  for (let m = 0; m < 12; m++) {
    const mesStr = `${anio}-${String(m + 1).padStart(2, '0')}`;
    const actEnMes = activos.filter((a) => {
      if (!a.fecha_ingreso || String(a.fecha_ingreso) > mesStr + '-31') return false;
      if (areaF && a.area !== areaF) return false;
      if (turnoF && a.turno !== turnoF) return false;
      return true;
    }).length;
    const cesEnMes = cesados.filter((c) => {
      if (!c.fecha_cese || String(c.fecha_cese).slice(0, 7) !== mesStr) return false;
      if (areaF && c.area !== areaF) return false;
      if (turnoF && c.turno !== turnoF) return false;
      return true;
    }).length;
    const total = actEnMes + cesEnMes;
    const tasa = total > 0 ? parseFloat(((cesEnMes / total) * 100).toFixed(1)) : 0;
    labels.push(`${MESES_NOMBRE[m]} ${anio}`);
    tasas.push(tasa);
  }
  crearBarChart(root.querySelector('#ch-rrhh-rotacion-mes'), 'ch-rrhh-rotacion-mes', {
    data: {
      labels,
      datasets: [{ label: '% ROTACIÓN', data: tasas, backgroundColor: '#FF0000aa', borderColor: '#FF0000', borderWidth: 1 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: '%', font: { weight: '700' } } },
        x: { ticks: { maxRotation: 45, font: { weight: '700', size: 9 } } },
      },
    },
  });
}

function pintarRrhhAsist7d(root, asistencia, progDescansos, anio, areaF, turnoF) {
  const labels = [];
  const presentes = [];
  const ausentes = [];
  const descansos = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const fecha = d.toISOString().slice(0, 10);
    labels.push(`${String(d.getDate()).padStart(2, '0')}/${MESES_NOMBRE[d.getMonth()]}`);
    const delDia = asistencia.filter((a) => a.fecha === fecha);
    presentes.push(delDia.filter((a) => a.estado === 'Presente').length);
    ausentes.push(delDia.filter((a) => a.estado === 'Ausente').length);
    descansos.push(delDia.filter((a) => a.estado === 'Descanso').length);
  }
  crearBarChart(root.querySelector('#ch-rrhh-asist-7d'), 'ch-rrhh-asist-7d', {
    data: {
      labels,
      datasets: [
        { label: 'PRESENTE', data: presentes, backgroundColor: '#4CAF50', borderColor: '#4CAF50', borderWidth: 1, stack: 'asist' },
        { label: 'AUSENTE', data: ausentes, backgroundColor: '#FF0000', borderColor: '#FF0000', borderWidth: 1, stack: 'asist' },
        { label: 'DESCANSO', data: descansos, backgroundColor: '#2196F3', borderColor: '#2196F3', borderWidth: 1, stack: 'asist' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10, weight: '700' } } } },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 30, font: { size: 9, weight: '700' } } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  });
}

function pintarRrhhDescTurno(root, progDescansos, anio) {
  const mesActual = new Date().getMonth();
  const anioActual = new Date().getFullYear();
  const filtrados = progDescansos.filter((d) => {
    if (!d.descansa) return false;
    if (anio !== anioActual) return String(d.fecha_seleccionada || '').slice(0, 4) === String(anio);
    const m = new Date(d.fecha_seleccionada).getMonth();
    return m === mesActual;
  });
  const byTurno = sumByKey(filtrados.map((d) => ({ key: d.turno || 'SIN TURNO', val: 1 })));
  let labels = [...byTurno.keys()].map((k) => k.toUpperCase());
  let data = [...byTurno.values()];
  if (!labels.length) { labels = ['SIN DATOS']; data = [0]; }
  crearDoughnutChart(root.querySelector('#ch-rrhh-desc-turno'), 'ch-rrhh-desc-turno', {
    data: {
      labels,
      datasets: [{ data, backgroundColor: ['#FFC107', '#FF9800', '#FF5722', '#9E9E9E'] }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10, weight: '700' } } } },
    },
  });
}

function pintarRrhhTopAusentes(root, asistencia, anio) {
  const mesActual = new Date().getMonth();
  const anioActual = new Date().getFullYear();
  const filtrados = asistencia.filter((a) => {
    if (!a.fecha) return false;
    if (a.estado !== 'Ausente') return false;
    if (anio !== anioActual) return String(a.fecha).slice(0, 4) === String(anio);
    const m = new Date(a.fecha).getMonth();
    return m === mesActual;
  });
  const byPid = new Map();
  for (const a of filtrados) {
    byPid.set(a.personal_id, (byPid.get(a.personal_id) || 0) + 1);
  }
  let entries = [...byPid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!entries.length) entries = [['SIN DATOS', 0]];
  const labels = entries.map(([pid]) => {
    const cache = root._rrhhCache;
    const emp = (cache?.activos || []).find((e) => e.id === pid);
    return emp ? emp.nombres.toUpperCase() : `ID:${String(pid).slice(0, 8)}`;
  });
  const vals = entries.map(([, v]) => v);
  crearBarChartHorizontal(root.querySelector('#ch-rrhh-top-ausentes'), 'ch-rrhh-top-ausentes', {
    data: {
      labels,
      datasets: [{ label: 'FALTAS', data: vals, backgroundColor: '#FF0000aa', borderColor: '#FF0000', borderWidth: 1, maxBarThickness: 18 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: () => navRrhh(),
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function pintarIndLogistica(root) {
  const anio = root.querySelector('#ind-log-anio')?.value || String(new Date().getFullYear());
  const cache = root._logCache;
  if (!cache) return;

  ['ch-hidro-grupo', 'ch-bar-epp-prod'].forEach((id) => destruirSiExiste(id));

  const hidrosFilt = (cache.hidros || []).filter((h) => String(h.fecha || '').slice(0, 4) === anio);
  pintarHidroGrupo(root, hidrosFilt);

  const eppFilt = (cache.epp || []).filter((e) => String(e.fecha_entrega || '').slice(0, 4) === anio);
  { // inline pintarEppEntregas
    const byProd = new Map();
    for (const r of eppFilt) {
      const key = r.producto || 'SIN PRODUCTO';
      const n = Number(r?.cantidad) || 1;
      byProd.set(key, (byProd.get(key) || 0) + (Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1));
    }
    let topProd = [...byProd.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!topProd.length) topProd = [['SIN DATOS', 0]];
    const valsProd = topProd.map(([, v]) => v);
    const maxProd = Math.max(0, ...valsProd);
    const xMaxProd = maxProd <= 0 ? 2 : Math.max(2, maxProd * 1.08);
    crearBarChartHorizontal(root.querySelector('#ch-bar-epp-prod'), 'ch-bar-epp-prod', {
      data: {
        labels: topProd.map(([k]) => String(k).toUpperCase()),
        datasets: [{ label: 'UNIDADES ENTREGADAS', data: valsProd, backgroundColor: '#FF0000', borderColor: '#FF0000', borderWidth: 1, maxBarThickness: 22 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 320, easing: 'easeOutQuad' },
        onClick: () => navEpp(),
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, max: xMaxProd, grid: { display: false }, border: { color: '#000', display: true },
            ticks: { color: '#000', font: { size: 11, weight: '700' }, callback(raw) { return typeof raw === 'number' ? String(Math.round(raw)) : raw; } } },
          y: { grid: { display: false }, border: { color: '#000', display: true },
            ticks: { color: '#000', font: { size: 11, weight: '700' }, autoSkip: true, maxRotation: 0 } },
        },
      },
    });
  }
}

function poblarIndMantSedes(root, equiposAll) {
  const sel = root.querySelector('#ind-mant-sede');
  if (!sel) return;
  const prev = sel.value;
  const sedes = [...new Set((equiposAll || []).map((e) => String(e.sede || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' }),
  );
  sel.innerHTML = `<option value="">TODAS</option>${sedes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}`;
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
}

function pintarIndicadoresMantenimiento(root) {
  const cache = root._mantDataCache;
  if (!cache) return;

  ['ind-mant-meses', 'ind-mant-estado', 'ind-mant-top'].forEach((id) => destruirSiExiste(id));

  const anio = Number(root.querySelector('#ind-mant-anio')?.value) || new Date().getFullYear();
  const sedeF = (root.querySelector('#ind-mant-sede')?.value || '').trim().toUpperCase();
  const marcaF = (root.querySelector('#ind-mant-marca')?.value || '').trim().toUpperCase();

  const { equipos, planes, actividades, correctivos } = cache;
  const eqFiltrados = (equipos || []).filter((e) => {
    if (sedeF && String(e.sede || '').trim().toUpperCase() !== sedeF) return false;
    if (marcaF && String(e.marca || '').trim().toUpperCase() !== marcaF) return false;
    return true;
  });
  const idsEq = new Set(eqFiltrados.map((e) => e.id));
  const planToEq = new Map((planes || []).map((p) => [p.id, p.equipo_id]));

  const actEnFiltro = (actividades || []).filter((a) => {
    const eid = planToEq.get(a.plan_id);
    return eid && idsEq.has(eid) && String(a.fecha_programada || '').startsWith(String(anio));
  });
  const corrEnFiltro = (correctivos || []).filter((c) => idsEq.has(c.equipo_id) && String(c.fecha_falla || '').slice(0, 4) === String(anio));

  const mesKeys = mesesDelAnioKeys(anio);
  const labelsMes = mesKeys.map((_, i) => `${MESES_CORTO[i]} ${anio}`);
  const prevMes = mesKeys.map((mk) =>
    actEnFiltro.filter((a) => a.estado === 'Completado' && String(a.fecha_programada || '').slice(0, 7) === mk).length,
  );
  const corrMes = mesKeys.map((mk) =>
    corrEnFiltro.filter((c) => c.estado === 'Reparado' && String(c.fecha_falla || '').slice(0, 7) === mk).length,
  );

  const navBase = { anio, sede: sedeF || undefined, marca: marcaF || undefined };

  crearBarChart(root.querySelector('#ind-mant-meses'), 'ind-mant-meses', {
    data: {
      labels: labelsMes,
      datasets: [
        { label: 'PREVENTIVO', data: prevMes, backgroundColor: '#1a1a2e', borderColor: '#1a1a2e', borderWidth: 1, stack: 's' },
        { label: 'CORRECTIVO', data: corrMes, backgroundColor: '#FF0000', borderColor: '#FF0000', borderWidth: 1, stack: 's' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 45, font: { size: 9, weight: '700' } } },
        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } },
      },
      onClick(_evt, elements) {
        if (!elements.length) return;
        const idx = elements[0].index;
        irAMantenimientosConFiltros({ ...navBase, mes: idx + 1 });
      },
    },
  });

  let op = 0;
  let mant = 0;
  let fuera = 0;
  for (const eq of eqFiltrados) {
    const c = clasificarEquipoEstado(eq.id, planes, actividades, correctivos);
    if (c === 'fuera') fuera++;
    else if (c === 'mantenimiento') mant++;
    else op++;
  }
  if (!eqFiltrados.length) {
    crearDoughnutChart(root.querySelector('#ind-mant-estado'), 'ind-mant-estado', {
      data: { labels: ['SIN EQUIPOS'], datasets: [{ data: [1], backgroundColor: ['#cccccc'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
    });
  } else {
    crearDoughnutChart(root.querySelector('#ind-mant-estado'), 'ind-mant-estado', {
      data: {
        labels: ['OPERATIVO', 'EN MANTENIMIENTO', 'FUERA DE SERVICIO'],
        datasets: [{ data: [op, mant, fuera], backgroundColor: ['#4CAF50', '#FFC107', '#FF0000'] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        onClick(_evt, elements) {
          if (!elements.length) return;
          const i = elements[0].index;
          const map = ['operativo', 'mantenimiento', 'fuera'];
          irAMantenimientosConFiltros({ ...navBase, estadoEquipo: map[i] });
        },
      },
    });
  }

  const porEq = new Map();
  for (const eid of idsEq) porEq.set(eid, 0);
  for (const c of correctivos || []) {
    if (!idsEq.has(c.equipo_id)) continue;
    if (String(c.fecha_falla || '').slice(0, 4) !== String(anio)) continue;
    porEq.set(c.equipo_id, (porEq.get(c.equipo_id) || 0) + 1);
  }
  let top = [...porEq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!top.length) top = [['', 0]];
  const topLabels = top.map(([id]) => {
    const eq = (equipos || []).find((e) => e.id === id);
    return (eq?.nombre || 'SIN DATOS').toUpperCase();
  });
  const topVals = top.map(([, v]) => v);
  const topNombres = top.map(([id]) => (equipos || []).find((e) => e.id === id)?.nombre || '');

  crearBarChartHorizontal(root.querySelector('#ind-mant-top'), 'ind-mant-top', {
    data: {
      labels: topLabels,
      datasets: [{ label: 'TOTAL', data: topVals, backgroundColor: '#1a1a2e', borderColor: '#1a1a2e', borderWidth: 1, maxBarThickness: 20 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
      onClick(_evt, elements) {
        if (!elements.length) return;
        const i = elements[0].index;
        const nom = topNombres[i];
        if (nom) irAMantenimientosConFiltros({ ...navBase, equipo: nom });
      },
    },
  });
}

function diaFlota(ts) {
  const d = new Date(ts);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtHoras(seg) {
  const total = Math.round(Number(seg) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function filtrarEventos(eventos, desde, hasta, vehiculoId) {
  const dDesde = new Date(desde + 'T06:00:00');
  const dHasta = new Date(hasta + 'T06:00:00');
  dHasta.setDate(dHasta.getDate() + 1);
  return (eventos || []).filter((e) => {
    const t = new Date(e.created_at).getTime();
    if (t < dDesde.getTime() || t >= dHasta.getTime()) return false;
    if (vehiculoId && e.vehiculo_id !== vehiculoId) return false;
    return true;
  });
}

async function pintarIndicadoresFlota(root) {
  ['ch-flota-peso', 'ch-flota-horas', 'ch-flota-viajes'].forEach((id) => destruirSiExiste(id));

  const desde = root.querySelector('#ind-flota-desde')?.value || '';
  const hasta = root.querySelector('#ind-flota-hasta')?.value || '';
  const vehiculoId = root.querySelector('#ind-flota-vehiculo')?.value || '';
  if (!desde || !hasta) return;

  const [{ data: eventos, error: errE }, { data: vehiculos, error: errV }] = await Promise.all([
    supabase.from('flota_eventos').select('*').order('created_at', { ascending: true }),
    supabase.from('flota_vehiculos').select('id, placa').order('placa'),
  ]);

  if (errE || errV) {
    notifyError('ERROR AL CARGAR DATOS DE FLOTA.');
    return;
  }

  const vehiculosMap = {};
  for (const v of (vehiculos || [])) vehiculosMap[v.id] = v;

  const filtrados = filtrarEventos(eventos, desde, hasta, vehiculoId);

  pintarFlotaPeso(root, filtrados, vehiculosMap);
  pintarFlotaHoras(root, filtrados, vehiculosMap);
  pintarFlotaViajes(root, filtrados, vehiculosMap);
}

function pintarFlotaPeso(root, eventos, vehiculosMap) {
  const pesoPorVeh = new Map();
  for (const ev of eventos) {
    if (ev.evento !== 'llega_mercado') continue;
    const pE = parseFloat(ev.tiket_salida_peso) || 0;
    const pP = parseFloat(ev.tiket_petromas_peso) || 0;
    const total = pE + pP;
    if (total <= 0) continue;
    pesoPorVeh.set(ev.vehiculo_id, (pesoPorVeh.get(ev.vehiculo_id) || 0) + total);
  }

  let labels, data;
  if (pesoPorVeh.size) {
    const ordenado = [...pesoPorVeh.entries()].sort((a, b) => b[1] - a[1]);
    labels = ordenado.map(([id]) => (vehiculosMap[id]?.placa || 'SIN PLACA').toUpperCase());
    data = ordenado.map(([, v]) => v);
  } else {
    labels = ['SIN DATOS'];
    data = [0];
  }

  crearBarChart(root.querySelector('#ch-flota-peso'), 'ch-flota-peso', {
    data: {
      labels,
      datasets: [{ label: 'PESO TOTAL (kg)', data, backgroundColor: '#FF0000aa', borderColor: '#FF0000', borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'kg', font: { weight: '700' } } },
        x: { ticks: { maxRotation: 45, font: { weight: '700', size: 10 } } },
      },
    },
  });
}

function pintarFlotaHoras(root, eventos, vehiculosMap) {
  const tiempoPorVeh = new Map();
  for (const ev of eventos) {
    const seg = parseFloat(ev.tiempo_desde_anterior) || 0;
    if (seg <= 0) continue;
    tiempoPorVeh.set(ev.vehiculo_id, (tiempoPorVeh.get(ev.vehiculo_id) || 0) + seg);
  }

  let labels, data;
  if (tiempoPorVeh.size) {
    const ordenado = [...tiempoPorVeh.entries()].sort((a, b) => b[1] - a[1]);
    labels = ordenado.map(([id]) => (vehiculosMap[id]?.placa || 'SIN PLACA').toUpperCase());
    data = ordenado.map(([, v]) => Math.round(v / 36) / 100);
  } else {
    labels = ['SIN DATOS'];
    data = [0];
  }

  crearBarChart(root.querySelector('#ch-flota-horas'), 'ch-flota-horas', {
    data: {
      labels,
      datasets: [{ label: 'HORAS TOTALES', data, backgroundColor: '#1a1a2eaa', borderColor: '#1a1a2e', borderWidth: 1 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'horas', font: { weight: '700' } } },
        x: { ticks: { maxRotation: 45, font: { weight: '700', size: 10 } } },
      },
    },
  });
}

function pintarFlotaViajes(root, eventos, vehiculosMap) {
  const vehiculosIds = [...new Set(eventos.map((e) => e.vehiculo_id))];
  if (!vehiculosIds.length) {
    crearBarChart(root.querySelector('#ch-flota-viajes'), 'ch-flota-viajes', {
      data: { labels: ['SIN DATOS'], datasets: [{ label: 'VIAJES', data: [0], backgroundColor: '#cccccc' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    });
    return;
  }

  const todosLosDias = new Set();
  const byDay = new Map();
  for (const ev of eventos) {
    if (ev.evento !== 'inicio_turno') continue;
    const dia = diaFlota(ev.created_at);
    todosLosDias.add(dia);
    const key = `${ev.vehiculo_id}|||${dia}`;
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }

  const labels = [...todosLosDias].sort();
  const datasets = [];
  const PALETA = ['#FF0000', '#1a1a2e', '#888888', '#444444', '#aaaaaa', '#222222', '#cc0000', '#4a4a6a', '#990000', '#5c5c7a', '#b30000', '#666666'];
  let colorIdx = 0;

  for (const vid of vehiculosIds) {
    const placa = (vehiculosMap[vid]?.placa || 'SIN PLACA').toUpperCase();
    const data = labels.map((dia) => byDay.get(`${vid}|||${dia}`) || 0);
    if (data.every((v) => v === 0)) continue;
    datasets.push({
      label: placa,
      data,
      backgroundColor: PALETA[colorIdx % PALETA.length] + 'cc',
      borderColor: PALETA[colorIdx % PALETA.length],
      borderWidth: 1,
    });
    colorIdx++;
  }

  if (!datasets.length) {
    datasets.push({ label: '—', data: [0], backgroundColor: '#cccccc' });
    labels.push('SIN DATOS');
  }

  crearBarChart(root.querySelector('#ch-flota-viajes'), 'ch-flota-viajes', {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10, weight: '700' } } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'viajes', font: { weight: '700' } } },
        x: { ticks: { maxRotation: 45, font: { weight: '700', size: 10 } } },
      },
    },
  });
}

