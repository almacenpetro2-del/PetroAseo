/**
 * Submódulo RRHH — ASISTENCIA (pase de lista diario por turno).
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';

let cacheActivos = [];
let cacheAsistencia = [];
let descansosCache = [];
let extraSeleccionados = new Map();

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

async function cargarActivos() {
  const { data, error } = await supabase.from('personal_activo').select('id, nombres, dni, turno, area').order('nombres');
  if (error) { notifyError(error.message); return; }
  cacheActivos = data || [];
}

async function cargarAsistencia(fecha, turno) {
  const { data, error } = await supabase
    .from('asistencia')
    .select('*')
    .eq('fecha', fecha)
    .eq('turno', turno);
  if (error) { notifyError(error.message); return []; }
  return data || [];
}

async function cargarDescansosDelDia(fecha, turno) {
  const { data, error } = await supabase
    .from('programacion_descansos')
    .select('personal_id')
    .eq('fecha_seleccionada', fecha)
    .eq('turno', turno)
    .eq('descansa', true);
  if (error) { notifyError(error.message); return []; }
  return (data || []).map((r) => r.personal_id);
}

async function cargarHistorial(host, desde, hasta, turno, q) {
  let query = supabase.from('asistencia').select('*, personal_activo!inner(nombres, dni)').order('fecha', { ascending: false }).order('created_at', { ascending: false });
  if (desde) query = query.gte('fecha', desde);
  if (hasta) query = query.lte('fecha', hasta);
  if (turno) query = query.eq('turno', turno);
  const { data, error } = await query;
  if (error) { notifyError(error.message); return; }
  let rows = data || [];
  if (q) {
    const qt = q.trim().toUpperCase();
    rows = rows.filter((r) => {
      const nom = String(r.personal_activo?.nombres || '').toUpperCase();
      const dni = String(r.personal_activo?.dni || '').toUpperCase();
      return nom.includes(qt) || dni.includes(qt);
    });
  }
  cacheAsistencia = rows;
  renderHistorial(host);
}

function renderLista(host, fecha, turno, registrosPrevios, domPresentes, descansosIds) {
  const lista = host.querySelector('#asist-lista');
  lista.innerHTML = '';

  const empleadosBase = cacheActivos.filter((a) => a.turno === turno);
  const presenteIds = new Set((registrosPrevios || []).filter((r) => r.estado === 'Presente').map((r) => r.personal_id));
  if (domPresentes) {
    for (const pid of domPresentes) presenteIds.add(pid);
  }
  const descansaSet = new Set(descansosIds || []);

  for (const emp of empleadosBase) {
    const presente = presenteIds.has(emp.id);
    const descansa = descansaSet.has(emp.id);
    lista.appendChild(crearFilaEmpleado(emp, presente, false, descansa));
  }

  for (const [id, emp] of extraSeleccionados) {
    const presente = presenteIds.has(id);
    const descansa = descansaSet.has(id);
    lista.appendChild(crearFilaEmpleado(emp, presente, true, descansa));
  }

  if (!empleadosBase.length && extraSeleccionados.size === 0) {
    lista.innerHTML = '<p class="flota-vacio">SIN EMPLEADOS PARA ESTE TURNO.</p>';
  }
}

function crearFilaEmpleado(emp, presente, esExtra, descansa) {
  const row = document.createElement('div');
  row.className = 'asist-fila';
  row.setAttribute('data-personal-id', emp.id);
  row.innerHTML = `
    <label class="asist-check-label">
      <input type="checkbox" class="asist-check" data-pid="${emp.id}" ${presente ? 'checked' : ''} />
      <span class="asist-check-custom"></span>
    </label>
    <span class="asist-nombre">${esc(emp.nombres)}${descansa ? ' <span class="asist-badge-descansa">DESCANSA</span>' : ''}</span>
    <span class="asist-dni">${esc(emp.dni)}</span>
    <span class="asist-col-extra">
      ${esExtra ? '<span class="asist-badge-extra">EXTRA</span>' : ''}
      ${esExtra ? `<button type="button" class="asist-btn-quitar" data-pid="${emp.id}" title="QUITAR">x</button>` : ''}
    </span>
  `;

  if (esExtra) {
    row.querySelector('.asist-btn-quitar')?.addEventListener('click', () => {
      extraSeleccionados.delete(emp.id);
      refrescarLista(host, true);
    });
  }

  return row;
}

function obtenerListaActual(host) {
  const filas = host.querySelectorAll('#asist-lista .asist-fila');
  const lista = [];
  for (const f of filas) {
    const pid = f.getAttribute('data-personal-id');
    const cb = f.querySelector('.asist-check');
    const esExtra = !!f.querySelector('.asist-badge-extra');
    lista.push({ personal_id: pid, estado: cb?.checked ? 'Presente' : 'Ausente', es_extra: esExtra });
  }
  return lista;
}

async function refrescarLista(host, preservarChecks = false) {
  const fecha = host.querySelector('#asist-fecha').value;
  const turno = host.querySelector('#asist-turno').value;
  let domPresentes = null;
  if (preservarChecks) {
    domPresentes = obtenerListaActual(host)
      .filter((item) => item.estado === 'Presente')
      .map((item) => item.personal_id);
  }
  const [previos, descansosIds] = await Promise.all([
    cargarAsistencia(fecha, turno),
    cargarDescansosDelDia(fecha, turno),
  ]);
  descansosCache = descansosIds;
  renderLista(host, fecha, turno, previos, domPresentes, descansosIds);
}

function renderHistorial(host) {
  const tbody = host.querySelector('#asist-hist-tbody');
  tbody.innerHTML = '';
  if (!cacheAsistencia.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1.5rem;">SIN REGISTROS.</td></tr>';
    return;
  }
  for (const r of cacheAsistencia) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(formatearFecha(r.fecha))}</td>
      <td>${esc(r.turno)}</td>
      <td>${esc(r.personal_activo?.nombres || '—')}</td>
      <td>${esc(r.personal_activo?.dni || '—')}</td>
      <td>${r.estado === 'Presente' ? '<span class="asist-estado asist-presente">PRESENTE</span>' : r.estado === 'Descanso' ? '<span class="asist-estado asist-descanso">DESCANSO</span>' : '<span class="asist-estado asist-ausente">AUSENTE</span>'}</td>
      <td>${r.es_extra ? 'SÍ' : '—'}</td>
    `;
    tbody.appendChild(tr);
  }
}

async function mostrarBuscadorExtra(host) {
  const existe = host.querySelector('#asist-buscador-extra');
  if (existe) { existe.remove(); return; }

  const wrapper = document.createElement('div');
  wrapper.id = 'asist-buscador-extra';
  wrapper.className = 'asist-buscador-extra';
  wrapper.innerHTML = `
    <input type="text" id="asist-input-buscar" class="input-upper" placeholder="BUSCAR EMPLEADO POR NOMBRE O DNI..." />
    <div id="asist-resultados-extra" class="asist-resultados"></div>
  `;

  const btnAgregar = host.querySelector('#asist-btn-agregar');
  btnAgregar.insertAdjacentElement('afterend', wrapper);

  const input = wrapper.querySelector('#asist-input-buscar');
  const resultados = wrapper.querySelector('#asist-resultados-extra');

  input.addEventListener('input', () => {
    const q = (input.value || '').trim().toUpperCase();
    if (!q) { resultados.innerHTML = ''; return; }
    const filtrados = cacheActivos.filter((a) => {
      if (extraSeleccionados.has(a.id)) return false;
      const n = String(a.nombres || '').toUpperCase();
      const d = String(a.dni || '').toUpperCase();
      return n.includes(q) || d.includes(q);
    }).slice(0, 8);

    resultados.innerHTML = filtrados.length
      ? filtrados.map((a) => `<div class="asist-resultado-item" data-pid="${a.id}">${esc(a.nombres)} — ${esc(a.dni)} (${esc(a.turno)})</div>`).join('')
      : '<div class="asist-resultado-item asist-resultado-vacio">SIN RESULTADOS</div>';

    resultados.querySelectorAll('.asist-resultado-item[data-pid]').forEach((el) => {
      el.addEventListener('click', () => {
        const pid = el.getAttribute('data-pid');
        const emp = cacheActivos.find((a) => a.id === pid);
        if (emp) {
          extraSeleccionados.set(emp.id, emp);
          refrescarLista(host, true);
          wrapper.remove();
        }
      });
    });
  });

  input.focus();
  input.addEventListener('blur', () => {
    setTimeout(() => { if (wrapper.parentNode) wrapper.remove(); }, 200);
  });
}

async function guardarAsistencia(host) {
  const fecha = host.querySelector('#asist-fecha').value;
  const turno = host.querySelector('#asist-turno').value;
  if (!fecha || !turno) { notifyError('SELECCIONE FECHA Y TURNO.'); return; }

  const lista = obtenerListaActual(host);
  if (!lista.length) { notifyError('NO HAY EMPLEADOS EN LA LISTA.'); return; }

  const upsertRows = lista.map((item) => {
    const enDescanso = descansosCache.includes(item.personal_id);
    return {
      personal_id: item.personal_id,
      fecha,
      turno,
      estado: enDescanso ? 'Descanso' : item.estado,
      es_extra: item.es_extra,
    };
  });

  const { error } = await supabase.from('asistencia').upsert(upsertRows, { onConflict: 'personal_id, fecha, turno' });
  if (error) { notifyError(error.message); return; }

  notifyOk(`ASISTENCIA GUARDADA: ${fecha} — ${turno} (${lista.filter((l) => l.estado === 'Presente').length} PRESENTES)`);
  await refrescarHistorial(host);

  extraSeleccionados.clear();
  host.querySelectorAll('#asist-lista .asist-badge-extra').forEach((b) => b.closest('.asist-fila')?.remove());
  host.querySelectorAll('#asist-lista .asist-check').forEach((cb) => { cb.checked = false; });
}

async function refrescarHistorial(host) {
  const desde = host.querySelector('#asist-hist-desde')?.value || '';
  const hasta = host.querySelector('#asist-hist-hasta')?.value || '';
  const turno = host.querySelector('#asist-hist-turno')?.value || '';
  const q = host.querySelector('#asist-hist-buscar')?.value || '';
  await cargarHistorial(host, desde, hasta, turno, q);
}

function exportarAsistencia(host) {
  const filas = cacheAsistencia.map((r) => ({
    FECHA: formatearFecha(r.fecha),
    TURNO: r.turno,
    EMPLEADO: r.personal_activo?.nombres || '',
    DNI: r.personal_activo?.dni || '',
    ESTADO: r.estado === 'Presente' ? 'PRESENTE' : 'AUSENTE',
    EXTRA: r.es_extra ? 'SÍ' : 'NO',
  }));
  exportarExcel('asistencia', 'ASISTENCIA', filas);
  notifyOk('EXCEL GENERADO.');
}

export async function iniciarPanelAsistencia(host, puedeEditar) {
  extraSeleccionados.clear();
  await cargarActivos();

  host.innerHTML = `
    <div class="submodule-panel">
      <h3 class="sub-title" style="margin-bottom:0.5rem;">PASE DE LISTA</h3>
      <div class="asist-form-bar">
        <label>FECHA<input type="date" id="asist-fecha" class="input-upper" value="${hoyISO()}" /></label>
        <label>TURNO
          <select id="asist-turno" class="input-upper">
            <option value="Mañana">MAÑANA</option>
            <option value="Tarde">TARDE</option>
            <option value="Noche">NOCHE</option>
          </select>
        </label>
        ${puedeEditar ? `<button type="button" class="btn btn-primary" id="asist-btn-agregar">+ AGREGAR EMPLEADO</button>` : ''}
      </div>

      <div class="asist-lista-wrap">
        <div class="asist-lista-header">
          <span style="width:24px;"></span>
          <span style="flex:1;font-weight:700;">NOMBRE</span>
          <span style="width:100px;font-weight:700;">DNI</span>
          <span style="width:80px;"></span>
        </div>
        <div id="asist-lista" class="asist-lista"></div>
      </div>

      ${puedeEditar ? `<div class="asist-acciones">
        <button type="button" class="btn btn-primary" id="asist-btn-guardar">GUARDAR ASISTENCIA</button>
      </div>` : ''}

      <h3 class="sub-title" style="margin-top:1.5rem;margin-bottom:0.5rem;">HISTORIAL DE ASISTENCIA</h3>
      <div class="filters-bar card">
        <label>DESDE<input type="date" id="asist-hist-desde" class="input-upper" /></label>
        <label>HASTA<input type="date" id="asist-hist-hasta" class="input-upper" /></label>
        <label>TURNO
          <select id="asist-hist-turno" class="input-upper">
            <option value="">TODOS</option>
            <option value="Mañana">MAÑANA</option>
            <option value="Tarde">TARDE</option>
            <option value="Noche">NOCHE</option>
          </select>
        </label>
        <label>BUSCAR<input type="text" id="asist-hist-buscar" class="input-upper" placeholder="NOMBRE O DNI" /></label>
        <button type="button" class="btn btn-secondary" id="asist-btn-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>FECHA</th><th>TURNO</th><th>EMPLEADO</th><th>DNI</th><th>ESTADO</th><th>EXTRA</th>
            </tr>
          </thead>
          <tbody id="asist-hist-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const fechaEl = host.querySelector('#asist-fecha');
  const turnoEl = host.querySelector('#asist-turno');

  const onChangeFechaTurno = async () => {
    extraSeleccionados.clear();
    await refrescarLista(host);
  };

  fechaEl.addEventListener('change', onChangeFechaTurno);
  turnoEl.addEventListener('change', onChangeFechaTurno);

  if (puedeEditar) {
    host.querySelector('#asist-btn-agregar')?.addEventListener('click', () => mostrarBuscadorExtra(host));
    host.querySelector('#asist-btn-guardar')?.addEventListener('click', () => guardarAsistencia(host));
  }

  const histTurno = host.querySelector('#asist-hist-turno');
  ['#asist-hist-desde', '#asist-hist-hasta', '#asist-hist-turno'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('change', () => refrescarHistorial(host));
  });
  host.querySelector('#asist-hist-buscar')?.addEventListener('input', () => refrescarHistorial(host));
  host.querySelector('#asist-btn-excel')?.addEventListener('click', () => exportarAsistencia(host));

  await refrescarLista(host);
  await refrescarHistorial(host);
}
