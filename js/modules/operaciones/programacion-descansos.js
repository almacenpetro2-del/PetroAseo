/**
 * Submódulo OPERACIONES — PROGRAMACIÓN DE DESCANSOS
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';

let cacheActivos = [];
let cacheDescansos = [];

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

async function cargarActivos() {
  const { data, error } = await supabase
    .from('personal_activo')
    .select('id, nombres, dni, turno, area')
    .order('nombres');
  if (error) { notifyError(error.message); return; }
  cacheActivos = data || [];
}

async function cargarDescansos(fecha, turno) {
  const { data, error } = await supabase
    .from('programacion_descansos')
    .select('*')
    .eq('fecha_seleccionada', fecha)
    .eq('turno', turno);
  if (error) { notifyError(error.message); return []; }
  return data || [];
}

async function cargarHistorial(host, desde, hasta, turno, q) {
  let query = supabase
    .from('programacion_descansos')
    .select('*')
    .eq('descansa', true)
    .order('fecha_seleccionada', { ascending: false })
    .order('created_at', { ascending: false });
  if (desde) query = query.gte('fecha_seleccionada', desde);
  if (hasta) query = query.lte('fecha_seleccionada', hasta);
  if (turno) query = query.eq('turno', turno);
  const { data, error } = await query;
  if (error) { notifyError(error.message); return; }
  let rows = data || [];
  if (q) {
    const qt = q.trim().toUpperCase();
    rows = rows.filter((r) => {
      const nom = String(r.nombre || '').toUpperCase();
      const dni = String(r.dni || '').toUpperCase();
      return nom.includes(qt) || dni.includes(qt);
    });
  }
  cacheDescansos = rows;
  renderHistorial(host);
}

function renderLista(host, registrosPrevios) {
  const lista = host.querySelector('#desc-lista');
  const turno = host.querySelector('#desc-turno').value;
  lista.innerHTML = '';

  const empleadosBase = cacheActivos.filter((a) => a.turno === turno);
  const descansaIds = new Set(
    (registrosPrevios || [])
      .filter((r) => r.descansa === true)
      .map((r) => r.personal_id)
  );

  for (const emp of empleadosBase) {
    const descansa = descansaIds.has(emp.id);
    lista.appendChild(crearFilaEmpleado(emp, descansa));
  }

  if (!empleadosBase.length) {
    lista.innerHTML = '<p class="flota-vacio">SIN EMPLEADOS PARA ESTE TURNO.</p>';
  }
}

function crearFilaEmpleado(emp, descansa) {
  const row = document.createElement('div');
  row.className = 'asist-fila';
  row.setAttribute('data-personal-id', emp.id);
  row.innerHTML = `
    <label class="asist-check-label">
      <input type="checkbox" class="asist-check" data-pid="${emp.id}" ${descansa ? 'checked' : ''} />
      <span class="asist-check-custom"></span>
    </label>
    <span class="asist-nombre">${esc(emp.nombres)}</span>
    <span class="asist-dni">${esc(emp.dni)}</span>
    <span class="asist-area">${esc(emp.area)}</span>
  `;
  return row;
}

function obtenerListaActual(host) {
  const filas = host.querySelectorAll('#desc-lista .asist-fila');
  const lista = [];
  for (const f of filas) {
    const pid = f.getAttribute('data-personal-id');
    const cb = f.querySelector('.asist-check');
    lista.push({
      personal_id: pid,
      descansa: cb?.checked || false,
    });
  }
  return lista;
}

async function refrescarLista(host) {
  const fecha = host.querySelector('#desc-fecha').value;
  const turno = host.querySelector('#desc-turno').value;
  const previos = await cargarDescansos(fecha, turno);
  renderLista(host, previos);
}

function renderHistorial(host) {
  const tbody = host.querySelector('#desc-hist-tbody');
  tbody.innerHTML = '';
  if (!cacheDescansos.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:1.5rem;">SIN REGISTROS.</td></tr>';
    return;
  }
  for (const r of cacheDescansos) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(formatearFecha(r.fecha_seleccionada))}</td>
      <td>${esc(r.turno)}</td>
      <td>${esc(r.nombre)}</td>
      <td>${esc(r.dni)}</td>
      <td>${esc(r.area)}</td>
      <td><span class="asist-estado asist-presente">SÍ</span></td>
    `;
    tbody.appendChild(tr);
  }
}

async function guardarDescansos(host) {
  const fecha = host.querySelector('#desc-fecha').value;
  const turno = host.querySelector('#desc-turno').value;
  if (!fecha || !turno) { notifyError('SELECCIONE FECHA Y TURNO.'); return; }

  const listaDOM = obtenerListaActual(host);
  if (!listaDOM.length) { notifyError('NO HAY EMPLEADOS EN LA LISTA.'); return; }

  const upsertRows = [];
  const procesados = new Set();

  for (const item of listaDOM) {
    const pid = item.personal_id;
    if (procesados.has(pid)) continue;
    procesados.add(pid);

    const empCache = cacheActivos.find((a) => a.id === pid);
    if (!empCache) continue;

    upsertRows.push({
      personal_id: pid,
      nombre: empCache.nombres,
      dni: empCache.dni,
      area: empCache.area,
      turno,
      fecha_seleccionada: fecha,
      descansa: item.descansa,
    });
  }

  if (!upsertRows.length) { notifyError('NO HAY DATOS PARA GUARDAR.'); return; }

  const { error } = await supabase
    .from('programacion_descansos')
    .upsert(upsertRows, { onConflict: 'personal_id, fecha_seleccionada, turno' });
  if (error) { notifyError(error.message); return; }

  const cantidad = upsertRows.filter((r) => r.descansa).length;
  notifyOk(`DESCANSOS GUARDADOS: ${fecha} — ${turno} (${cantidad} DESCANSAN)`);
  await refrescarHistorial(host);

  host.querySelectorAll('#desc-lista .asist-check').forEach((cb) => { cb.checked = false; });
}

async function refrescarHistorial(host) {
  const desde = host.querySelector('#desc-hist-desde')?.value || '';
  const hasta = host.querySelector('#desc-hist-hasta')?.value || '';
  const turno = host.querySelector('#desc-hist-turno')?.value || '';
  const q = host.querySelector('#desc-hist-buscar')?.value || '';
  await cargarHistorial(host, desde, hasta, turno, q);
}

function exportarDescansos() {
  const filas = cacheDescansos.map((r) => ({
    FECHA: formatearFecha(r.fecha_seleccionada),
    TURNO: r.turno,
    EMPLEADO: r.nombre,
    DNI: r.dni,
    ÁREA: r.area,
    DESCANSA: 'SÍ',
  }));
  exportarExcel('programacion_descansos', 'PROGRAMACION_DESCANSOS', filas);
  notifyOk('EXCEL GENERADO.');
}

export async function iniciarPanelProgramacionDescansos(host, puedeEditar) {
  await cargarActivos();

  host.innerHTML = `
    <div class="submodule-panel">
      <h3 class="sub-title" style="margin-bottom:0.5rem;">PROGRAMACIÓN DE DESCANSOS</h3>
      <div class="asist-form-bar">
        <label>FECHA<input type="date" id="desc-fecha" class="input-upper" value="${hoyISO()}" /></label>
        <label>TURNO
          <select id="desc-turno" class="input-upper">
            <option value="Mañana">MAÑANA</option>
            <option value="Tarde">TARDE</option>
            <option value="Noche">NOCHE</option>
          </select>
        </label>
      </div>

      <div class="asist-lista-wrap">
        <div class="asist-lista-header">
          <span style="width:24px;"></span>
          <span style="flex:1;font-weight:700;">NOMBRE</span>
          <span style="width:100px;font-weight:700;">DNI</span>
          <span style="width:140px;font-weight:700;">ÁREA</span>
        </div>
        <div id="desc-lista" class="asist-lista"></div>
      </div>

      ${puedeEditar ? `<div class="asist-acciones">
        <button type="button" class="btn btn-primary" id="desc-btn-guardar">GUARDAR DESCANSOS</button>
      </div>` : ''}

      <h3 class="sub-title" style="margin-top:1.5rem;margin-bottom:0.5rem;">HISTORIAL DE DESCANSOS</h3>
      <div class="filters-bar card">
        <label>DESDE<input type="date" id="desc-hist-desde" class="input-upper" /></label>
        <label>HASTA<input type="date" id="desc-hist-hasta" class="input-upper" /></label>
        <label>TURNO
          <select id="desc-hist-turno" class="input-upper">
            <option value="">TODOS</option>
            <option value="Mañana">MAÑANA</option>
            <option value="Tarde">TARDE</option>
            <option value="Noche">NOCHE</option>
          </select>
        </label>
        <label>BUSCAR<input type="text" id="desc-hist-buscar" class="input-upper" placeholder="NOMBRE O DNI" /></label>
        <button type="button" class="btn btn-secondary" id="desc-btn-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>FECHA</th><th>TURNO</th><th>EMPLEADO</th><th>DNI</th><th>ÁREA</th><th>¿DESCANSA?</th>
            </tr>
          </thead>
          <tbody id="desc-hist-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const fechaEl = host.querySelector('#desc-fecha');
  const turnoEl = host.querySelector('#desc-turno');

  const onChangeFechaTurno = async () => {
    await refrescarLista(host);
  };

  fechaEl.addEventListener('change', onChangeFechaTurno);
  turnoEl.addEventListener('change', onChangeFechaTurno);

  if (puedeEditar) {
    host.querySelector('#desc-btn-guardar')?.addEventListener('click', () => guardarDescansos(host));
  }

  ['#desc-hist-desde', '#desc-hist-hasta', '#desc-hist-turno'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('change', () => refrescarHistorial(host));
  });
  host.querySelector('#desc-hist-buscar')?.addEventListener('input', () => refrescarHistorial(host));
  host.querySelector('#desc-btn-excel')?.addEventListener('click', () => exportarDescansos());

  await refrescarLista(host);
  await refrescarHistorial(host);
}
