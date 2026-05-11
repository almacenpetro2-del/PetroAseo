/**
 * Submódulo MANTENIMIENTOS — preventivo, correctivo y repuestos (Supabase + Chart.js).
 */
import { supabase } from '../supabase-client.js';
import { perfilActual, puedeEditarModulo } from '../auth.js';
import { notifyOk, notifyError } from '../utils/notifications.js';
import { formatearFecha } from '../utils/validators.js';
import { attachAutocomplete } from '../utils/autocomplete.js';
import { exportarExcel } from '../utils/excel.js';
import { hoyISO, ultimoPlanPorEquipo, clasificarEquipoEstado } from '../utils/mantenimiento-stats.js';

const FRECUENCIAS = [
  'Diario',
  'Semanal',
  'Quincenal',
  'Mensual',
  'Bimensual',
  'Trimestral',
  'Semestral',
  'Anual',
  'Personalizado',
];

const ESTADOS_ACTIVIDAD = ['Pendiente', 'En Proceso', 'Completado', 'Cancelado'];
const ESTADOS_CORRECTIVO = ['Pendiente', 'En Reparación', 'Reparado'];
const UNIDADES_REP = ['Unidad', 'Litro', 'Metro', 'Juego', 'Kit', 'Par'];

const MESES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * @param {HTMLElement} contenedor Panel SPA (#op-panel-mant)
 * @param {{ puede?: boolean, filtrosNavegacion?: Record<string, unknown>|null }} opts
 */
export async function renderMantenimientos(contenedor, opts = {}) {
  const puede = opts.puede !== undefined ? opts.puede : puedeEditarModulo(perfilActual.rol, 'operaciones');
  /** @type {string|null} */
  let filtroEstadoEquipo = null;
  /** @type {string|null} */
  let filtroMarcaEquipo = null;
  /** @type {{ soloAbiertos?: boolean }|null} */
  let navFiltroExtra = null;

  contenedor.innerHTML = `
    <div class="mant-modulo" id="mant-root">
      ${!puede ? '<p class="mant-readonly-banner">SOLO LECTURA — NO PUEDE EDITAR REGISTROS EN OPERACIONES.</p>' : ''}

      <section class="mant-section" aria-labelledby="mant-s2">
        <h3 id="mant-s2" class="mant-section__title">PROGRAMAR MANTENIMIENTO MENSUAL</h3>
        ${puede ? `<button type="button" class="btn btn-primary mant-btn-programar" id="mant-toggle-plan">+ PROGRAMAR MANTENIMIENTO MENSUAL</button>` : ''}
        <div id="mant-plan-wrap" class="is-hidden">
          <form id="mant-form-equipo" class="mant-form-equipo card">
            <input type="hidden" id="mant-eq-id" />
            <label>NOMBRE DEL EQUIPO<input id="mant-eq-nombre" class="input-upper" required ${puede ? '' : 'disabled'} /></label>
            <label>N° SERIE / PLACA<input id="mant-eq-serie" class="input-upper" required ${puede ? '' : 'disabled'} /></label>
            <label>UBICACIÓN<input id="mant-eq-ubi" class="input-upper" required ${puede ? '' : 'disabled'} /></label>
            <label>MARCA<input id="mant-eq-marca" class="input-upper" required ${puede ? '' : 'disabled'} /></label>
            <label>CARACTERÍSTICAS (OPCIONAL)<input id="mant-eq-car" class="input-upper" ${puede ? '' : 'disabled'} /></label>
            <label>SEDE<input id="mant-eq-sede" class="input-upper" required placeholder="LIMA, CALLAO…" ${puede ? '' : 'disabled'} /></label>
            <div class="mant-form-equipo__actions">
              ${puede ? '<button type="submit" class="btn btn-primary">GUARDAR EQUIPO</button>' : ''}
            </div>
          </form>
          <div id="mant-plan-editor" class="mant-plan-editor mant-plan-editor is-disabled">
            <input type="hidden" id="mant-plan-id" />
            <div class="mant-plan-titulo">
              <label>TÍTULO DEL PLAN<input type="text" id="mant-plan-titulo" class="input-upper" required ${puede ? '' : 'disabled'} /></label>
            </div>
            <div class="table-wrap">
              <table class="data-table" id="mant-tab-act">
                <thead><tr><th>ITEM</th><th>ACTIVIDAD</th><th>FECHA PROG.</th><th>FRECUENCIA</th><th>RESPONSABLE</th><th>ESTADO</th>${puede ? '<th></th>' : ''}</tr></thead>
                <tbody id="mant-tab-act-body"></tbody>
              </table>
            </div>
            ${puede ? `<div class="mant-toolbar">
              <button type="button" class="btn btn-secondary" id="mant-add-act">+ AGREGAR ACTIVIDAD</button>
              <button type="button" class="btn btn-primary" id="mant-save-plan">💾 GUARDAR PLAN</button>
            </div>` : ''}
          </div>
          <div class="table-wrap" style="margin-top:1rem;">
            <table class="data-table" id="mant-tab-equipos">
              <thead><tr><th>EQUIPO</th><th>SERIE</th><th>SEDE</th><th>ÚLTIMO PLAN</th><th>PRÓX. VENCIMIENTO</th><th>ACCIONES</th></tr></thead>
              <tbody id="mant-tab-equipos-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="mant-section" aria-labelledby="mant-s3">
        <h3 id="mant-s3" class="mant-section__title">MANTENIMIENTOS CORRECTIVOS</h3>
        <div class="mant-correctivos-actions">
          <input type="text" id="mant-corr-buscar" class="input-upper" placeholder="BUSCAR EQUIPO…" />
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.65rem;font-weight:800;">SEDE
            <select id="mant-corr-sede" class="input-upper"><option value="">TODAS</option></select>
          </label>
          <select id="mant-corr-estado" class="input-upper">
            <option value="">TODOS LOS ESTADOS</option>
            ${ESTADOS_CORRECTIVO.map((e) => `<option value="${e}">${e.toUpperCase()}</option>`).join('')}
          </select>
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.65rem;font-weight:800;">DESDE<input type="date" id="mant-corr-desde" /></label>
          <label style="display:flex;flex-direction:column;gap:0.25rem;font-size:0.65rem;font-weight:800;">HASTA<input type="date" id="mant-corr-hasta" /></label>
          <button type="button" class="btn btn-secondary" id="mant-corr-excel">📥 DESCARGAR EXCEL</button>
          ${puede ? '<button type="button" class="btn btn-primary" id="mant-corr-nuevo">➕ NUEVO CORRECTIVO</button>' : ''}
        </div>
        <div class="table-wrap">
          <table class="data-table" id="mant-tab-corr">
            <thead><tr><th>FECHA FALLA</th><th>EQUIPO</th><th>ACTIVIDAD</th><th>REPUESTOS</th><th>RESPONSABLE</th><th>ESTADO</th>${puede ? '<th></th>' : ''}</tr></thead>
            <tbody id="mant-tab-corr-body"></tbody>
          </table>
        </div>
      </section>

      <section class="mant-section" aria-labelledby="mant-s4">
        <h3 id="mant-s4" class="mant-section__title">LISTA MAESTRA DE REPUESTOS</h3>
        ${puede ? '<button type="button" class="btn btn-primary" id="mant-rep-nuevo">➕ NUEVO REPUESTO</button>' : ''}
        <div class="table-wrap" style="margin-top:0.75rem;">
          <table class="data-table" id="mant-tab-rep">
            <thead><tr><th>CÓDIGO</th><th>NOMBRE</th><th>UNIDAD</th><th>STOCK MÍN.</th>${puede ? '<th></th>' : ''}</tr></thead>
            <tbody id="mant-tab-rep-body"></tbody>
          </table>
        </div>
      </section>
    </div>

    <dialog class="mant-modal" id="mant-dlg-corr">
      <div class="mant-modal__inner">
        <h3 class="mant-modal__title">NUEVO CORRECTIVO</h3>
        <form id="mant-form-corr">
          <div class="mant-modal__grid">
            <label>EQUIPO<select id="mant-corr-equipo" required></select></label>
            <label>FECHA DE FALLA<input type="datetime-local" id="mant-corr-fecha" required /></label>
            <label>DESCRIPCIÓN DE LA FALLA<textarea id="mant-corr-desc" class="input-upper" rows="3" required></textarea></label>
            <label>ACTIVIDAD REALIZADA<textarea id="mant-corr-act" class="input-upper" rows="2"></textarea></label>
            <label>RESPONSABLE<input id="mant-corr-resp" class="input-upper" /></label>
            <label>ESTADO<select id="mant-corr-est" required>${ESTADOS_CORRECTIVO.map((e) => `<option value="${e}">${e}</option>`).join('')}</select></label>
          </div>
          <div class="mant-rep-rows">
            <h5>REPUESTOS UTILIZADOS</h5>
            <div id="mant-corr-rep-host"></div>
            <button type="button" class="btn btn-secondary btn-sm" id="mant-corr-add-rep">+ AGREGAR REPUESTO</button>
          </div>
          <div class="mant-modal__actions">
            <button type="button" class="btn btn-ghost" id="mant-corr-cancel">CANCELAR</button>
            <button type="submit" class="btn btn-primary">GUARDAR CORRECTIVO</button>
          </div>
        </form>
      </div>
    </dialog>
  `;

  /** @type {{ destroy:()=>void, refresh:()=>Promise<void>}[]} */
  const acDestroy = [];
  const sedeInput = contenedor.querySelector('#mant-eq-sede');
  if (sedeInput && puede) {
    acDestroy.push(
      attachAutocomplete(sedeInput, {
        loadValues: async () => {
          const { data } = await supabase.from('mant_equipos').select('sede');
          return (data || []).map((r) => r.sede);
        },
      }),
    );
  }

  /** @type {Record<string, unknown>} */
  let cache = {};

  async function fetchTodo() {
    const [
      { data: equipos, error: e1 },
      { data: planes, error: e2 },
      { data: actividades, error: e3 },
      { data: correctivosRaw, error: e4 },
      { data: repuestos, error: e5 },
      { data: lineasRep, error: e6 },
    ] = await Promise.all([
      supabase.from('mant_equipos').select('*').order('nombre'),
      supabase.from('mant_planes').select('*'),
      supabase.from('mant_actividades_plan').select('*').order('item_orden'),
      supabase.from('mant_correctivos').select('*').order('fecha_falla', { ascending: false }),
      supabase.from('mant_repuestos').select('*').order('nombre'),
      supabase.from('mant_correctivo_repuestos').select('*'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    if (e5) throw e5;
    if (e6) throw e6;
    const eqNombre = new Map((equipos || []).map((e) => [e.id, e.nombre]));
    const correctivos = (correctivosRaw || []).map((c) => ({
      ...c,
      mant_equipos: { nombre: eqNombre.get(c.equipo_id) || '' },
    }));
    cache = { equipos: equipos || [], planes: planes || [], actividades: actividades || [], correctivos, repuestos: repuestos || [], lineasRep: lineasRep || [] };
    return cache;
  }

  function pintarSelectSedesCorr() {
    const sel = contenedor.querySelector('#mant-corr-sede');
    if (!sel) return;
    const prev = sel.value;
    const sedes = [...new Set((cache.equipos || []).map((e) => String(e.sede || '').trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    );
    sel.innerHTML = `<option value="">TODAS</option>${sedes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}`;
    if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  /**
   * @param {Array<{id:string,nombre:string,cantidad_stock:number}>} productos
   * @param {string} nombreRep
   * @param {string} codigoRep
   */
  function matchProductoId(productos, nombreRep, codigoRep) {
    const n = String(nombreRep ?? '').trim().toUpperCase();
    const c = String(codigoRep ?? '').trim().toUpperCase();
    for (const p of productos || []) {
      const pn = String(p.nombre ?? '').trim().toUpperCase();
      if (pn === n || (c && pn === c)) return p.id;
    }
    return null;
  }

  async function descontarStockProducto(productoId, cantidad) {
    const { error } = await supabase.rpc('descontar_stock_producto', { p_producto_id: productoId, p_cantidad: cantidad });
    if (!error) return;
    const { data: row, error: e2 } = await supabase.from('productos').select('id,cantidad_stock').eq('id', productoId).maybeSingle();
    if (e2 || !row) throw error;
    if (row.cantidad_stock < cantidad) throw new Error('STOCK_INSUFICIENTE');
    const { error: e3 } = await supabase.from('productos').update({ cantidad_stock: row.cantidad_stock - cantidad }).eq('id', productoId);
    if (e3) throw e3;
  }

  function aplicarFiltrosNavegacion(f) {
    if (!f || typeof f !== 'object') return;
    navFiltroExtra = f.soloAbiertos ? { soloAbiertos: true } : null;
    if (f.anio != null && f.mes != null) {
      const y = Number(f.anio);
      const m = Number(f.mes);
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        const desde = `${y}-${String(m).padStart(2, '0')}-01`;
        const ult = new Date(y, m, 0).getDate();
        const hasta = `${y}-${String(m).padStart(2, '0')}-${String(ult).padStart(2, '0')}`;
        const elD = contenedor.querySelector('#mant-corr-desde');
        const elH = contenedor.querySelector('#mant-corr-hasta');
        if (elD) elD.value = desde;
        if (elH) elH.value = hasta;
      }
    }
    if (f.sede) {
      const el = contenedor.querySelector('#mant-corr-sede');
      if (el) el.value = String(f.sede).toUpperCase();
    }
    if (f.estadoCorrectivo && ESTADOS_CORRECTIVO.includes(String(f.estadoCorrectivo))) {
      const el = contenedor.querySelector('#mant-corr-estado');
      if (el) el.value = f.estadoCorrectivo;
    }
    if (f.equipo) {
      const el = contenedor.querySelector('#mant-corr-buscar');
      if (el) el.value = String(f.equipo);
    }
    filtroEstadoEquipo = ['operativo', 'mantenimiento', 'fuera'].includes(String(f.estadoEquipo)) ? String(f.estadoEquipo) : null;
    filtroMarcaEquipo = f.marca ? String(f.marca).trim() : null;
    pintarTablaEquipos();
    pintarTablaCorrectivos();
    contenedor.querySelector('#mant-s3')?.scrollIntoView({ behavior: 'smooth' });
  }

  function repuestosPorCorrectivo(cid) {
    return cache.lineasRep.filter((l) => l.correctivo_id === cid);
  }

  function textoRepuestos(cid) {
    const lines = repuestosPorCorrectivo(cid);
    if (!lines.length) return '—';
    return lines.map((l) => `${l.nombre_snapshot} (${l.cantidad})`).join(', ');
  }

  function proximoVencimiento(equipoId) {
    const lp = ultimoPlanPorEquipo(cache.planes, equipoId);
    if (!lp) return null;
    const acts = (cache.actividades || []).filter((a) => a.plan_id === lp.id && !['Completado', 'Cancelado'].includes(String(a.estado)));
    if (!acts.length) return null;
    const fechas = acts.map((a) => String(a.fecha_programada)).sort((a, b) => a.localeCompare(b));
    return fechas[0];
  }

  function pintarTablaEquipos() {
    const tb = contenedor.querySelector('#mant-tab-equipos-body');
    tb.innerHTML = '';
    const { equipos, planes, actividades, correctivos } = cache;
    let shown = 0;
    for (const eq of equipos) {
      if (filtroMarcaEquipo && String(eq.marca || '').toUpperCase() !== filtroMarcaEquipo.toUpperCase()) continue;
      if (filtroEstadoEquipo) {
        const st = clasificarEquipoEstado(eq.id, planes, actividades, correctivos);
        if (st !== filtroEstadoEquipo) continue;
      }
      shown++;
      const lp = ultimoPlanPorEquipo(planes, eq.id);
      const ultLabel = lp ? `${MESES[lp.mes - 1]} ${lp.anio}` : '—';
      const pv = proximoVencimiento(eq.id);
      const tr = document.createElement('tr');
      tr.dataset.equipoId = eq.id;
      tr.innerHTML = `
        <td>${esc(eq.nombre)}</td>
        <td>${esc(eq.numero_serie_placa)}</td>
        <td>${esc(eq.sede)}</td>
        <td>${esc(ultLabel)}</td>
        <td>${pv ? formatearFecha(pv) : '—'}</td>
        <td class="mant-table-actions">
          <button type="button" class="btn btn-sm btn-secondary mant-ver-plan" data-id="${eq.id}">VER PLAN</button>
          ${puede ? `<button type="button" class="btn btn-sm mant-edit-eq" data-id="${eq.id}">EDITAR</button>` : ''}
          ${puede ? `<button type="button" class="btn btn-sm btn-danger mant-del-eq" data-id="${eq.id}">ELIMINAR</button>` : ''}
        </td>`;
      tb.appendChild(tr);
    }
    if (!equipos.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6">SIN EQUIPOS REGISTRADOS.</td>`;
      tb.appendChild(tr);
    } else if (!shown) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6">NINGÚN EQUIPO COINCIDE CON EL FILTRO.</td>`;
      tb.appendChild(tr);
    }
  }

  function filtrarCorrectivos() {
    const q = contenedor.querySelector('#mant-corr-buscar').value.trim().toLowerCase();
    const est = contenedor.querySelector('#mant-corr-estado').value;
    const d1 = contenedor.querySelector('#mant-corr-desde').value;
    const d2 = contenedor.querySelector('#mant-corr-hasta').value;
    const sedeF = contenedor.querySelector('#mant-corr-sede')?.value.trim().toUpperCase() || '';
    const sedeByEq = new Map((cache.equipos || []).map((e) => [e.id, String(e.sede || '').trim().toUpperCase()]));
    return (cache.correctivos || []).filter((c) => {
      const nom = (c.mant_equipos?.nombre || '').toLowerCase();
      if (q && !nom.includes(q)) return false;
      if (est && c.estado !== est) return false;
      if (navFiltroExtra?.soloAbiertos && !['Pendiente', 'En Reparación'].includes(String(c.estado))) return false;
      if (filtroEstadoEquipo) {
        const st = clasificarEquipoEstado(c.equipo_id, cache.planes, cache.actividades, cache.correctivos);
        if (st !== filtroEstadoEquipo) return false;
      }
      if (sedeF && sedeByEq.get(c.equipo_id) !== sedeF) return false;
      if (filtroMarcaEquipo) {
        const eq = (cache.equipos || []).find((e) => e.id === c.equipo_id);
        if (!eq || String(eq.marca || '').toUpperCase() !== filtroMarcaEquipo.toUpperCase()) return false;
      }
      const f = String(c.fecha_falla).slice(0, 10);
      if (d1 && f < d1) return false;
      if (d2 && f > d2) return false;
      return true;
    });
  }

  function pintarTablaCorrectivos() {
    const tb = contenedor.querySelector('#mant-tab-corr-body');
    tb.innerHTML = '';
    const rows = filtrarCorrectivos();
    for (const c of rows) {
      const tr = document.createElement('tr');
      const dt = String(c.fecha_falla).replace('T', ' ').slice(0, 16);
      tr.innerHTML = `
        <td>${esc(dt)}</td>
        <td>${esc((c.mant_equipos?.nombre || '').toUpperCase())}</td>
        <td>${esc(String(c.actividad_realizada || '—').toUpperCase())}</td>
        <td>${esc(textoRepuestos(c.id))}</td>
        <td>${esc(String(c.responsable || '').toUpperCase())}</td>
        <td>${esc(String(c.estado || '').toUpperCase())}</td>
        ${
          puede
            ? `<td><button type="button" class="btn btn-sm btn-danger mant-del-corr" data-id="${c.id}">ELIMINAR</button></td>`
            : ''
        }`;
      tb.appendChild(tr);
    }
    if (!rows.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${puede ? 7 : 6}">SIN REGISTROS.</td>`;
      tb.appendChild(tr);
    }
  }

  function pintarTablaRepuestos() {
    const tb = contenedor.querySelector('#mant-tab-rep-body');
    tb.innerHTML = '';
    for (const r of cache.repuestos || []) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(r.codigo)}</td>
        <td>${esc(r.nombre)}</td>
        <td>${esc(r.unidad)}</td>
        <td>${r.stock_minimo}</td>
        ${
          puede
            ? `<td class="mant-table-actions">
          <button type="button" class="mant-icon-btn mant-edit-rep" data-id="${r.id}" title="EDITAR">✏️</button>
          <button type="button" class="mant-icon-btn mant-del-rep" data-id="${r.id}" title="ELIMINAR">🗑️</button>
        </td>`
            : ''
        }`;
      tb.appendChild(tr);
    }
    if (!cache.repuestos?.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="${puede ? 5 : 4}">SIN REPUESTOS.</td>`;
      tb.appendChild(tr);
    }
  }

  async function refrescarCorrectivosParcial() {
    const [{ data: correctivosRaw, error: e4 }, { data: lineasRepNew, error: e6 }] = await Promise.all([
      supabase.from('mant_correctivos').select('*').order('fecha_falla', { ascending: false }),
      supabase.from('mant_correctivo_repuestos').select('*'),
    ]);
    if (e4) throw e4;
    if (e6) throw e6;
    const eqNombre = new Map((cache.equipos || []).map((e) => [e.id, e.nombre]));
    cache.correctivos = (correctivosRaw || []).map((c) => ({
      ...c,
      mant_equipos: { nombre: eqNombre.get(c.equipo_id) || '' },
    }));
    cache.lineasRep = lineasRepNew || [];
    pintarTablaCorrectivos();
  }

  async function refrescar() {
    try {
      await fetchTodo();
      pintarSelectSedesCorr();
      pintarTablaEquipos();
      pintarTablaCorrectivos();
      pintarTablaRepuestos();
    } catch (err) {
      console.error(err);
      notifyError(err.message || 'ERROR AL CARGAR MANTENIMIENTOS.');
    }
  }

  function abrirPlanEditor(habilitar) {
    const ed = contenedor.querySelector('#mant-plan-editor');
    ed.classList.toggle('is-disabled', !habilitar);
  }

  function filasActividadVacias() {
    const tb = contenedor.querySelector('#mant-tab-act-body');
    tb.innerHTML = '';
    agregarFilaActividad();
  }

  function agregarFilaActividad() {
    const tb = contenedor.querySelector('#mant-tab-act-body');
    const n = tb.querySelectorAll('tr').length + 1;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${n}</td>
      <td><input class="input-upper mant-a-act" required /></td>
      <td><input type="date" class="mant-a-fecha" required /></td>
      <td><select class="mant-a-freq input-upper">${FRECUENCIAS.map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}</select></td>
      <td><input class="input-upper mant-a-resp" required /></td>
      <td><select class="mant-a-est input-upper">${ESTADOS_ACTIVIDAD.map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}</select></td>
      ${puede ? `<td><button type="button" class="mant-icon-btn mant-row-del" title="ELIMINAR">🗑️</button></td>` : ''}`;
    tb.appendChild(tr);
    tr.querySelector('.mant-row-del')?.addEventListener('click', () => {
      tr.remove();
      renumerarActividades();
    });
  }

  function renumerarActividades() {
    contenedor.querySelectorAll('#mant-tab-act-body tr').forEach((tr, i) => {
      tr.querySelector('td:first-child').textContent = String(i + 1);
    });
  }

  function leerFilasActividad() {
    const rows = [];
    contenedor.querySelectorAll('#mant-tab-act-body tr').forEach((tr, i) => {
      const act = tr.querySelector('.mant-a-act')?.value.trim();
      const fecha = tr.querySelector('.mant-a-fecha')?.value;
      const freq = tr.querySelector('.mant-a-freq')?.value;
      const resp = tr.querySelector('.mant-a-resp')?.value.trim();
      const est = tr.querySelector('.mant-a-est')?.value;
      if (act && fecha && freq && resp && est) {
        rows.push({ item_orden: i + 1, actividad: act, fecha_programada: fecha, frecuencia: freq, responsable: resp, estado: est });
      }
    });
    return rows;
  }

  function cargarActividadesEnTabla(list) {
    const tb = contenedor.querySelector('#mant-tab-act-body');
    tb.innerHTML = '';
    let i = 0;
    for (const a of list) {
      i++;
      const tr = document.createElement('tr');
      tr.dataset.actId = a.id;
      tr.innerHTML = `
        <td>${i}</td>
        <td><input class="input-upper mant-a-act" required /></td>
        <td><input type="date" class="mant-a-fecha" required /></td>
        <td><select class="mant-a-freq input-upper">${FRECUENCIAS.map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}</select></td>
        <td><input class="input-upper mant-a-resp" required /></td>
        <td><select class="mant-a-est input-upper">${ESTADOS_ACTIVIDAD.map((f) => `<option value="${f}">${f.toUpperCase()}</option>`).join('')}</select></td>
        ${puede ? `<td><button type="button" class="mant-icon-btn mant-row-del" title="ELIMINAR">🗑️</button></td>` : ''}`;
      tr.querySelector('.mant-a-act').value = a.actividad ?? '';
      tr.querySelector('.mant-a-fecha').value = a.fecha_programada ?? '';
      tr.querySelector('.mant-a-freq').value = a.frecuencia ?? 'Mensual';
      tr.querySelector('.mant-a-resp').value = a.responsable ?? '';
      tr.querySelector('.mant-a-est').value = a.estado ?? 'Pendiente';
      tb.appendChild(tr);
      tr.querySelector('.mant-row-del')?.addEventListener('click', () => {
        tr.remove();
        renumerarActividades();
      });
    }
    if (!list.length) agregarFilaActividad();
  }

  async function cargarEquipoYPlan(equipoId) {
    const eq = cache.equipos.find((e) => e.id === equipoId);
    if (!eq) return;
    contenedor.querySelector('#mant-eq-id').value = eq.id;
    contenedor.querySelector('#mant-eq-nombre').value = eq.nombre;
    contenedor.querySelector('#mant-eq-serie').value = eq.numero_serie_placa;
    contenedor.querySelector('#mant-eq-ubi').value = eq.ubicacion;
    contenedor.querySelector('#mant-eq-marca').value = eq.marca;
    contenedor.querySelector('#mant-eq-car').value = eq.caracteristicas || '';
    contenedor.querySelector('#mant-eq-sede').value = eq.sede;

    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    let plan = (cache.planes || []).find((p) => p.equipo_id === eq.id && p.anio === anio && p.mes === mes);
    contenedor.querySelector('#mant-plan-id').value = plan?.id || '';
    const tituloBase = `MANTENIMIENTO ${MESES[mes - 1]} ${anio} — ${eq.nombre}`;
    contenedor.querySelector('#mant-plan-titulo').value = plan?.titulo || tituloBase;
    if (plan) {
      const acts = (cache.actividades || []).filter((a) => a.plan_id === plan.id).sort((a, b) => a.item_orden - b.item_orden);
      cargarActividadesEnTabla(acts);
    } else {
      filasActividadVacias();
    }
    abrirPlanEditor(true);
  }

  /** Repuestos: siguiente código AUTO-NNN */
  async function siguienteAutoCodigo() {
    const { data } = await supabase.from('mant_repuestos').select('codigo').like('codigo', 'AUTO-%');
    let max = 0;
    for (const r of data || []) {
      const n = parseInt(String(r.codigo).replace(/^AUTO-/i, ''), 10);
      if (n > max) max = n;
    }
    return `AUTO-${String(max + 1).padStart(3, '0')}`;
  }

  /** Busca repuesto por nombre exacto (trim); si no existe, crea con unidad por defecto. */
  async function asegurarRepuestoPorNombre(nombreRaw, unidadDef = 'Unidad') {
    const nombre = String(nombreRaw || '').trim();
    if (!nombre) return null;
    const { data: found } = await supabase.from('mant_repuestos').select('id').eq('nombre', nombre.toUpperCase()).limit(1);
    if (found?.length) return found[0].id;
    const codigo = await siguienteAutoCodigo();
    const { data: ins, error } = await supabase
      .from('mant_repuestos')
      .insert({ codigo, nombre: nombre.toUpperCase(), unidad: unidadDef, stock_minimo: 0 })
      .select('id')
      .single();
    if (error) throw error;
    return ins.id;
  }

  /** Modal correctivo: filas repuesto */
  const repAcList = [];
  function limpiarRepRowsAc() {
    repAcList.forEach((a) => a.destroy());
    repAcList.length = 0;
    contenedor.querySelector('#mant-corr-rep-host').innerHTML = '';
  }

  function addRepuestoRowModal() {
    const host = contenedor.querySelector('#mant-corr-rep-host');
    const row = document.createElement('div');
    row.className = 'mant-rep-row';
    row.innerHTML = `
      <label>REPUESTO<input type="text" class="input-upper mant-rep-nom" required placeholder="BUSCAR O ESCRIBIR" /></label>
      <label>CANTIDAD<input type="number" class="mant-rep-cant" min="1" step="1" value="1" required /></label>
      ${puede ? '<button type="button" class="btn btn-sm btn-danger mant-rep-row-x">✕</button>' : ''}`;
    host.appendChild(row);
    const inp = row.querySelector('.mant-rep-nom');
    const ac = attachAutocomplete(inp, {
      loadValues: async () => (cache.repuestos || []).map((r) => r.nombre),
    });
    repAcList.push(ac);
    row.querySelector('.mant-rep-row-x')?.addEventListener('click', () => {
      ac.destroy();
      const ix = repAcList.indexOf(ac);
      if (ix >= 0) repAcList.splice(ix, 1);
      row.remove();
    });
  }

  function llenarSelectEquiposCorr() {
    const sel = contenedor.querySelector('#mant-corr-equipo');
    sel.innerHTML = cache.equipos.map((e) => `<option value="${e.id}">${esc(e.nombre.toUpperCase())}</option>`).join('');
  }

  // ——— Eventos ———
  const dlg = contenedor.querySelector('#mant-dlg-corr');
  contenedor.querySelector('#mant-toggle-plan')?.addEventListener('click', () => {
    const w = contenedor.querySelector('#mant-plan-wrap');
    w.classList.toggle('is-hidden');
  });

  contenedor.querySelector('#mant-form-equipo')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!puede) return;
    const nombre = contenedor.querySelector('#mant-eq-nombre').value.trim();
    const numero_serie_placa = contenedor.querySelector('#mant-eq-serie').value.trim();
    const ubicacion = contenedor.querySelector('#mant-eq-ubi').value.trim();
    const marca = contenedor.querySelector('#mant-eq-marca').value.trim();
    const caracteristicas = contenedor.querySelector('#mant-eq-car').value.trim();
    const sede = contenedor.querySelector('#mant-eq-sede').value.trim();
    if (!nombre || !numero_serie_placa || !ubicacion || !marca || !sede) {
      notifyError('COMPLETE LOS CAMPOS OBLIGATORIOS DEL EQUIPO.');
      return;
    }
    try {
      const { data: row, error } = await supabase
        .from('mant_equipos')
        .upsert(
          {
            nombre: nombre.toUpperCase(),
            numero_serie_placa: numero_serie_placa.toUpperCase(),
            ubicacion: ubicacion.toUpperCase(),
            marca: marca.toUpperCase(),
            caracteristicas: caracteristicas.toUpperCase(),
            sede: sede.toUpperCase(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'numero_serie_placa' },
        )
        .select('id')
        .single();
      if (error) throw error;
      contenedor.querySelector('#mant-eq-id').value = row.id;
      notifyOk('EQUIPO GUARDADO.');
      await refrescar();
      await cargarEquipoYPlan(row.id);
    } catch (err) {
      console.error(err);
      notifyError(err.message || 'ERROR AL GUARDAR EQUIPO.');
    }
  });

  contenedor.querySelector('#mant-add-act')?.addEventListener('click', () => agregarFilaActividad());

  contenedor.querySelector('#mant-save-plan')?.addEventListener('click', async () => {
    if (!puede) return;
    const equipoId = contenedor.querySelector('#mant-eq-id').value;
    if (!equipoId) {
      notifyError('GUARDE PRIMERO EL EQUIPO.');
      return;
    }
    const titulo = contenedor.querySelector('#mant-plan-titulo').value.trim();
    if (!titulo) {
      notifyError('INDIQUE EL TÍTULO DEL PLAN.');
      return;
    }
    const filas = leerFilasActividad();
    if (!filas.length) {
      notifyError('AGREGUE AL MENOS UNA ACTIVIDAD.');
      return;
    }
    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    try {
      let planId = contenedor.querySelector('#mant-plan-id').value;
      if (!planId) {
        let pNew = null;
        let e1 = null;
        const ins = await supabase
          .from('mant_planes')
          .insert({ equipo_id: equipoId, titulo: titulo.toUpperCase(), anio, mes })
          .select('id')
          .single();
        pNew = ins.data;
        e1 = ins.error;
        if (e1?.code === '23505') {
          const { data: ex } = await supabase
            .from('mant_planes')
            .select('id')
            .eq('equipo_id', equipoId)
            .eq('anio', anio)
            .eq('mes', mes)
            .maybeSingle();
          pNew = ex;
        } else if (e1) throw e1;
        planId = pNew?.id;
        if (!planId) throw new Error('NO SE PUDO CREAR NI ENCONTRAR EL PLAN.');
        contenedor.querySelector('#mant-plan-id').value = planId;
      } else {
        const { error: e2 } = await supabase.from('mant_planes').update({ titulo: titulo.toUpperCase() }).eq('id', planId);
        if (e2) throw e2;
      }
      const { error: eDel } = await supabase.from('mant_actividades_plan').delete().eq('plan_id', planId);
      if (eDel) throw eDel;
      const hoy = hoyISO();
      const toIns = filas.map((f) => ({
        plan_id: planId,
        item_orden: f.item_orden,
        actividad: f.actividad.toUpperCase(),
        fecha_programada: f.fecha_programada,
        frecuencia: f.frecuencia,
        responsable: f.responsable.toUpperCase(),
        estado: f.estado,
        fecha_completado: f.estado === 'Completado' ? hoy : null,
      }));
      const { error: eIns } = await supabase.from('mant_actividades_plan').insert(toIns);
      if (eIns) throw eIns;
      notifyOk('PLAN GUARDADO.');
      await refrescar();
      await cargarEquipoYPlan(equipoId);
    } catch (err) {
      console.error(err);
      notifyError(err.message || 'ERROR AL GUARDAR PLAN.');
    }
  });

  contenedor.querySelector('#mant-tab-equipos-body')?.addEventListener('click', async (ev) => {
    const t = /** @type {HTMLElement} */ (ev.target);
    const ver = t.closest('.mant-ver-plan');
    const ed = t.closest('.mant-edit-eq');
    const del = t.closest('.mant-del-eq');
    if (ver) {
      const id = ver.getAttribute('data-id');
      const tr = ver.closest('tr');
      const next = tr?.nextElementSibling;
      if (next?.classList.contains('mant-expand-row')) {
        next.remove();
        return;
      }
      contenedor.querySelectorAll('.mant-expand-row').forEach((r) => r.remove());
      const lp = ultimoPlanPorEquipo(cache.planes, id);
      const acts = lp ? (cache.actividades || []).filter((a) => a.plan_id === lp.id).sort((a, b) => a.item_orden - b.item_orden) : [];
      const exp = document.createElement('tr');
      exp.className = 'mant-expand-row';
      exp.innerHTML = `<td colspan="6">
        <strong>PLAN: ${esc(lp?.titulo || '—')}</strong>
        <table class="mant-subtable"><thead><tr><th>ITEM</th><th>ACTIVIDAD</th><th>FECHA</th><th>FREC.</th><th>RESP.</th><th>ESTADO</th></tr></thead>
        <tbody>${acts.map((a) => `<tr><td>${a.item_orden}</td><td>${esc(a.actividad)}</td><td>${formatearFecha(a.fecha_programada)}</td><td>${esc(a.frecuencia)}</td><td>${esc(a.responsable)}</td><td>${esc(a.estado)}</td></tr>`).join('')}</tbody></table>
      </td>`;
      tr?.after(exp);
      return;
    }
    if (ed) {
      contenedor.querySelector('#mant-plan-wrap')?.classList.remove('is-hidden');
      await cargarEquipoYPlan(ed.getAttribute('data-id'));
      return;
    }
    if (del) {
      if (!window.confirm('¿ELIMINAR EQUIPO, SUS PLANES Y CORRECTIVOS VINCULADOS?')) return;
      try {
        const { error } = await supabase.from('mant_equipos').delete().eq('id', del.getAttribute('data-id'));
        if (error) throw error;
        notifyOk('EQUIPO ELIMINADO.');
        contenedor.querySelector('#mant-form-equipo')?.reset();
        contenedor.querySelector('#mant-eq-id').value = '';
        contenedor.querySelector('#mant-plan-id').value = '';
        abrirPlanEditor(false);
        filasActividadVacias();
        await refrescar();
      } catch (err) {
        console.error(err);
        notifyError(err.message || 'ERROR AL ELIMINAR.');
      }
    }
  });

  ['#mant-corr-buscar', '#mant-corr-estado', '#mant-corr-desde', '#mant-corr-hasta', '#mant-corr-sede'].forEach((sel) => {
    contenedor.querySelector(sel)?.addEventListener('input', () => {
      navFiltroExtra = null;
      pintarTablaCorrectivos();
    });
    contenedor.querySelector(sel)?.addEventListener('change', () => {
      navFiltroExtra = null;
      pintarTablaCorrectivos();
    });
  });

  contenedor.querySelector('#mant-corr-excel')?.addEventListener('click', () => {
    try {
      const rows = filtrarCorrectivos().map((c) => ({
        FECHA_FALLA: String(c.fecha_falla).replace('T', ' '),
        EQUIPO: c.mant_equipos?.nombre,
        ACTIVIDAD: c.actividad_realizada,
        REPUESTOS: textoRepuestos(c.id),
        RESPONSABLE: c.responsable,
        ESTADO: c.estado,
      }));
      exportarExcel('MANTENIMIENTOS_CORRECTIVOS', 'CORRECTIVOS', rows);
      notifyOk('EXCEL GENERADO.');
    } catch (err) {
      notifyError('ERROR AL EXPORTAR.');
    }
  });

  contenedor.querySelector('#mant-corr-nuevo')?.addEventListener('click', () => {
    llenarSelectEquiposCorr();
    contenedor.querySelector('#mant-form-corr').reset();
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    contenedor.querySelector('#mant-corr-fecha').value = now.toISOString().slice(0, 16);
    limpiarRepRowsAc();
    addRepuestoRowModal();
    dlg.showModal();
  });

  contenedor.querySelector('#mant-corr-cancel')?.addEventListener('click', () => {
    dlg.close();
    limpiarRepRowsAc();
  });

  contenedor.querySelector('#mant-corr-add-rep')?.addEventListener('click', () => addRepuestoRowModal());

  contenedor.querySelector('#mant-form-corr')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const equipo_id = contenedor.querySelector('#mant-corr-equipo').value;
    const fecha_falla_raw = contenedor.querySelector('#mant-corr-fecha').value;
    const descripcion_falla = contenedor.querySelector('#mant-corr-desc').value.trim();
    const actividad_realizada = contenedor.querySelector('#mant-corr-act').value.trim();
    const responsable = contenedor.querySelector('#mant-corr-resp').value.trim();
    const estado = contenedor.querySelector('#mant-corr-est').value;
    if (!equipo_id || !fecha_falla_raw || !descripcion_falla) {
      notifyError('COMPLETE LOS CAMPOS OBLIGATORIOS.');
      return;
    }
    const fecha_falla = new Date(fecha_falla_raw).toISOString();
    const fecha_reparado = estado === 'Reparado' ? hoyISO() : null;
    const host = contenedor.querySelectorAll('#mant-corr-rep-host .mant-rep-row');
    /** @type {{ nom: string, cant: number }[]} */
    const lineasRep = [];
    for (const row of host) {
      const nom = row.querySelector('.mant-rep-nom')?.value.trim();
      const cant = Number(row.querySelector('.mant-rep-cant')?.value);
      if (!nom || !Number.isFinite(cant) || cant < 1) continue;
      lineasRep.push({ nom, cant: Math.trunc(cant) });
    }
    try {
      const { data: productosList, error: ep } = await supabase.from('productos').select('id,nombre,cantidad_stock');
      if (ep) throw ep;
      /** @type {{ repId: string, cant: number, prodId: string|null }[]} */
      const planDeduc = [];
      /** @type {Map<string, number>} */
      const sumaPorProducto = new Map();
      for (const ln of lineasRep) {
        const repId = await asegurarRepuestoPorNombre(ln.nom);
        const { data: repRow, error: er0 } = await supabase.from('mant_repuestos').select('nombre,codigo').eq('id', repId).maybeSingle();
        if (er0) throw er0;
        const prodId = matchProductoId(productosList || [], repRow?.nombre, repRow?.codigo);
        if (prodId) sumaPorProducto.set(prodId, (sumaPorProducto.get(prodId) || 0) + ln.cant);
        planDeduc.push({ repId, cant: ln.cant, prodId });
      }
      for (const [prodId, totalNec] of sumaPorProducto) {
        const p = (productosList || []).find((x) => x.id === prodId);
        if (p && p.cantidad_stock < totalNec) {
          notifyError(`STOCK INSUFICIENTE EN LOGÍSTICA: ${p.nombre} (NECESARIO ${totalNec}, DISPONIBLE ${p.cantidad_stock}).`);
          return;
        }
      }
      const { data: corr, error } = await supabase
        .from('mant_correctivos')
        .insert({
          equipo_id,
          fecha_falla,
          descripcion_falla: descripcion_falla.toUpperCase(),
          actividad_realizada: actividad_realizada.toUpperCase(),
          responsable: responsable.toUpperCase(),
          estado,
          fecha_reparado,
        })
        .select('id')
        .single();
      if (error) throw error;
      for (let i = 0; i < lineasRep.length; i++) {
        const ln = lineasRep[i];
        const { repId, cant } = planDeduc[i];
        const { error: er2 } = await supabase.from('mant_correctivo_repuestos').insert({
          correctivo_id: corr.id,
          repuesto_id: repId,
          nombre_snapshot: ln.nom.toUpperCase(),
          cantidad: cant,
        });
        if (er2) throw er2;
      }
      for (const p of planDeduc) {
        if (p.prodId) {
          await descontarStockProducto(p.prodId, p.cant);
        }
      }
      notifyOk('CORRECTIVO GUARDADO. STOCK ACTUALIZADO CUANDO HUBO COINCIDENCIA EN PRODUCTOS.');
      dlg.close();
      limpiarRepRowsAc();
      await refrescarCorrectivosParcial();
    } catch (err) {
      console.error(err);
      notifyError(err.message || 'ERROR AL GUARDAR.');
    }
  });

  contenedor.querySelector('#mant-tab-corr-body')?.addEventListener('click', async (ev) => {
    const btn = /** @type {HTMLElement} */ (ev.target).closest('.mant-del-corr');
    if (!btn || !puede) return;
    if (!window.confirm('¿ELIMINAR ESTE CORRECTIVO?')) return;
    try {
      const { error } = await supabase.from('mant_correctivos').delete().eq('id', btn.getAttribute('data-id'));
      if (error) throw error;
      notifyOk('ELIMINADO.');
      await refrescar();
    } catch (err) {
      notifyError('ERROR AL ELIMINAR.');
    }
  });

  /** Repuestos CRUD inline nuevo */
  contenedor.querySelector('#mant-rep-nuevo')?.addEventListener('click', () => {
    const tb = contenedor.querySelector('#mant-tab-rep-body');
    const tr = document.createElement('tr');
    tr.className = 'mant-rep-new';
    tr.innerHTML = `
      <td><input class="input-upper" placeholder="CÓDIGO" data-f="codigo" required /></td>
      <td><input class="input-upper" placeholder="NOMBRE" data-f="nombre" required /></td>
      <td><select data-f="unidad">${UNIDADES_REP.map((u) => `<option value="${u}">${u}</option>`).join('')}</select></td>
      <td><input type="number" data-f="stock" min="0" value="0" /></td>
      <td><button type="button" class="btn btn-sm btn-primary mant-rep-save-new">GUARDAR</button>
          <button type="button" class="btn btn-sm btn-ghost mant-rep-cancel-new">CANCELAR</button></td>`;
    tb.prepend(tr);
    tr.querySelector('.mant-rep-cancel-new')?.addEventListener('click', () => tr.remove());
    tr.querySelector('.mant-rep-save-new')?.addEventListener('click', async () => {
      const codigo = tr.querySelector('[data-f="codigo"]').value.trim();
      const nombre = tr.querySelector('[data-f="nombre"]').value.trim();
      const unidad = tr.querySelector('[data-f="unidad"]').value;
      const stock_minimo = Number(tr.querySelector('[data-f="stock"]').value) || 0;
      if (!codigo || !nombre) {
        notifyError('CÓDIGO Y NOMBRE OBLIGATORIOS.');
        return;
      }
      try {
        const { error } = await supabase.from('mant_repuestos').insert({
          codigo: codigo.toUpperCase(),
          nombre: nombre.toUpperCase(),
          unidad,
          stock_minimo,
        });
        if (error) throw error;
        notifyOk('REPUESTO CREADO.');
        tr.remove();
        await refrescar();
      } catch (err) {
        notifyError(err.message || 'ERROR.');
      }
    });
  });

  contenedor.querySelector('#mant-tab-rep-body')?.addEventListener('click', async (ev) => {
    const ed = /** @type {HTMLElement} */ (ev.target).closest('.mant-edit-rep');
    const del = /** @type {HTMLElement} */ (ev.target).closest('.mant-del-rep');
    if (ed) {
      const id = ed.getAttribute('data-id');
      const r = cache.repuestos.find((x) => x.id === id);
      if (!r) return;
      const nombre = window.prompt('NOMBRE', r.nombre);
      if (nombre === null) return;
      const unidad = window.prompt(`UNIDAD (${UNIDADES_REP.join(', ')})`, r.unidad);
      if (unidad === null) return;
      const sm = window.prompt('STOCK MÍNIMO', String(r.stock_minimo));
      if (sm === null) return;
      try {
        const { error } = await supabase
          .from('mant_repuestos')
          .update({ nombre: nombre.trim().toUpperCase(), unidad, stock_minimo: Number(sm) || 0 })
          .eq('id', id);
        if (error) throw error;
        notifyOk('ACTUALIZADO.');
        await refrescar();
      } catch (err) {
        notifyError(err.message || 'ERROR.');
      }
    }
    if (del) {
      const id = del.getAttribute('data-id');
      const { data: uso } = await supabase.from('mant_correctivo_repuestos').select('id').eq('repuesto_id', id).limit(1);
      if (uso?.length) {
        if (!window.confirm('ESTE REPUESTO ESTÁ EN CORRECTIVOS. ¿ELIMINAR DE TODAS FORMAS?')) return;
      } else if (!window.confirm('¿ELIMINAR REPUESTO?')) return;
      try {
        const { error } = await supabase.from('mant_repuestos').delete().eq('id', id);
        if (error) throw error;
        notifyOk('ELIMINADO.');
        await refrescar();
      } catch (err) {
        notifyError(err.message || 'NO SE PUEDE ELIMINAR (PUEDE ESTAR EN USO).');
      }
    }
  });

  contenedor._mantRefresh = refrescar;
  contenedor._mantAplicarFiltros = aplicarFiltrosNavegacion;
  contenedor._spaCleanup = () => {
    acDestroy.forEach((a) => a.destroy());
    limpiarRepRowsAc();
  };

  await refrescar();
  if (opts.filtrosNavegacion) aplicarFiltrosNavegacion(opts.filtrosNavegacion);
}
