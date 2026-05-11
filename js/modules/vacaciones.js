/**
 * Submódulo VACACIONES — solicitudes, cálculo de días, alertas de regreso.
 */
import { supabase } from '../supabase-client.js';
import { notifyOk, notifyError } from '../utils/notifications.js';
import { exportarExcel } from '../utils/excel.js';

let cachePersonal = [];
let cacheVacaciones = [];
let currentPersonalId = null;

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function fmtFecha(ts) {
  if (!ts) return '—';
  const dt = new Date(ts);
  if (isNaN(dt.getTime())) return '—';
  const dia = String(dt.getDate()).padStart(2, '0');
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${dt.getFullYear()}`;
}

function diffMeses(fechaIngresoStr) {
  const desde = new Date(fechaIngresoStr);
  const hoy = new Date();
  return (hoy.getFullYear() - desde.getFullYear()) * 12 + (hoy.getMonth() - desde.getMonth());
}

function calcularDiasCorrespondientes(fechaIngresoStr) {
  const meses = diffMeses(fechaIngresoStr);
  return Math.floor(meses / 12) * 30;
}

function calcularDiasYaTomados(personalId) {
  let total = 0;
  for (const v of cacheVacaciones) {
    if (v.personal_id === personalId) total += Number(v.dias_vacaciones) || 0;
  }
  return total;
}

function calcularDiasDisponibles(personalId, fechaIngresoStr) {
  const corresponden = calcularDiasCorrespondientes(fechaIngresoStr);
  const tomados = calcularDiasYaTomados(personalId);
  return Math.max(0, corresponden - tomados);
}

function sumarDias(fechaStr, dias) {
  const d = new Date(fechaStr + 'T12:00:00');
  d.setDate(d.getDate() + Number(dias));
  return d.toISOString().slice(0, 10);
}

async function cargarTodo(host) {
  const [{ data: pa, error: e1 }, { data: vc, error: e2 }] = await Promise.all([
    supabase.from('personal_activo').select('id, nombres, dni, fecha_ingreso, turno').order('nombres'),
    supabase.from('vacaciones').select('*').order('created_at', { ascending: false }),
  ]);
  if (e1) { notifyError(e1.message); return; }
  if (e2) { notifyError(e2.message); return; }
  cachePersonal = pa || [];
  cacheVacaciones = vc || [];
  renderTablaHistorial(host);
}

function mostrarSugerencias(host, query) {
  const lista = host.querySelector('#vac-sugerencias');
  if (!lista) return;
  lista.innerHTML = '';
  const q = (query || '').trim().toUpperCase();
  if (!q) { lista.style.display = 'none'; return; }
  const matches = cachePersonal.filter((p) =>
    String(p.nombres || '').toUpperCase().includes(q) || String(p.dni || '').includes(q)
  ).slice(0, 8);
  if (!matches.length) { lista.style.display = 'none'; return; }
  for (const p of matches) {
    const item = document.createElement('div');
    item.className = 'vac-sug-item';
    item.textContent = `${p.nombres} — ${p.dni}`;
    item.addEventListener('click', () => seleccionarTrabajador(host, p));
    lista.appendChild(item);
  }
  lista.style.display = 'block';
}

function seleccionarTrabajador(host, personal) {
  currentPersonalId = personal.id;
  host.querySelector('#vac-nombres').value = personal.nombres;
  host.querySelector('#vac-dni').value = personal.dni;
  host.querySelector('#vac-fecha-ingreso').value = personal.fecha_ingreso;
  host.querySelector('#vac-turno').value = personal.turno;
  const disponibles = calcularDiasDisponibles(personal.id, personal.fecha_ingreso);
  host.querySelector('#vac-dias-disponibles').textContent = disponibles;
  host.querySelector('#vac-dias-disponibles').setAttribute('data-disponibles', disponibles);
  host.querySelector('#vac-dias').max = disponibles;
  host.querySelector('#vac-sugerencias').style.display = 'none';
  actualizarFechaRegreso(host);
}

function actualizarFechaRegreso(host) {
  const salida = host.querySelector('#vac-fecha-salida')?.value;
  const dias = parseInt(host.querySelector('#vac-dias')?.value, 10) || 0;
  if (salida && dias > 0) {
    host.querySelector('#vac-fecha-regreso').value = sumarDias(salida, dias);
  }
}

async function onGuardarVacaciones(ev, host, puedeEditar) {
  ev.preventDefault();
  if (!puedeEditar) return;
  const nombres = host.querySelector('#vac-nombres')?.value?.trim() || '';
  const dni = host.querySelector('#vac-dni')?.value?.trim() || '';
  const fecha_salida = host.querySelector('#vac-fecha-salida')?.value || '';
  const dias_vacaciones = parseInt(host.querySelector('#vac-dias')?.value, 10) || 0;
  const fecha_regreso = host.querySelector('#vac-fecha-regreso')?.value || '';
  if (!currentPersonalId || !nombres || !dni || !fecha_salida || !dias_vacaciones || !fecha_regreso) {
    notifyError('COMPLETE TODOS LOS CAMPOS OBLIGATORIOS.');
    return;
  }
  const disponibles = parseInt(host.querySelector('#vac-dias-disponibles')?.getAttribute('data-disponibles'), 10) || 0;
  if (dias_vacaciones > disponibles) {
    notifyError(`SOLO TIENE ${disponibles} DÍA(S) DISPONIBLE(S).`);
    return;
  }
  const { error } = await supabase.from('vacaciones').insert({
    personal_id: currentPersonalId,
    dni,
    nombre: nombres,
    fecha_salida,
    dias_vacaciones,
    fecha_regreso,
  });
  if (error) { notifyError(error.message); return; }
  notifyOk('VACACIONES REGISTRADAS.');
  host.querySelector('#vac-form')?.reset();
  currentPersonalId = null;
  host.querySelector('#vac-dni').value = '';
  host.querySelector('#vac-fecha-ingreso').value = '';
  host.querySelector('#vac-turno').value = '';
  host.querySelector('#vac-dias-disponibles').textContent = '0';
  host.querySelector('#vac-dias-disponibles').setAttribute('data-disponibles', '0');
  host.querySelector('#vac-dias').max = '0';
  await cargarTodo(host);
}

async function onEliminarVacacion(host, id) {
  const { error } = await supabase.from('vacaciones').delete().eq('id', id);
  if (error) { notifyError(error.message); return; }
  notifyOk('REGISTRO ELIMINADO.');
  await cargarTodo(host);
}

function renderTablaHistorial(host) {
  const tbody = host.querySelector('#vac-tbody');
  if (!tbody) return;
  const q = (host.querySelector('#vac-buscar')?.value || '').trim().toUpperCase();
  let rows = [...cacheVacaciones];
  if (q) {
    rows = rows.filter((r) =>
      String(r.nombre || '').toUpperCase().includes(q) ||
      String(r.dni || '').toUpperCase().includes(q)
    );
  }
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:1rem;">SIN REGISTROS.</td></tr>';
    return;
  }
  for (const r of rows) {
    const hoy = new Date();
    const regreso = new Date(r.fecha_regreso);
    const difDias = Math.ceil((regreso - hoy) / (1000 * 60 * 60 * 24));
    let estado = '—';
    if (difDias < 0) estado = 'FINALIZADO';
    else if (difDias === 0) estado = 'REGRESA HOY';
    else if (difDias <= 2) estado = 'REGRESA EN ' + difDias + ' DÍA(S)';
    else estado = 'EN CURSO';

    const persona = cachePersonal.find((p) => p.id === r.personal_id);
    const disponibles = persona ? calcularDiasDisponibles(r.personal_id, persona.fecha_ingreso) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.nombre)}</td>
      <td>${esc(r.dni)}</td>
      <td>${fmtFecha(r.fecha_salida)}</td>
      <td>${r.dias_vacaciones}</td>
      <td>${fmtFecha(r.fecha_regreso)}</td>
      <td>${disponibles}</td>
      <td>${esc(estado)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm btn-danger" data-vac-eliminar="${r.id}">ELIMINAR</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-vac-eliminar]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('¿ELIMINAR ESTE REGISTRO DE VACACIONES?')) {
        onEliminarVacacion(host, b.getAttribute('data-vac-eliminar'));
      }
    })
  );
}

function exportarExcelVacaciones(host) {
  const q = (host.querySelector('#vac-buscar')?.value || '').trim().toUpperCase();
  let rows = [...cacheVacaciones];
  if (q) {
    rows = rows.filter((r) =>
      String(r.nombre || '').toUpperCase().includes(q) ||
      String(r.dni || '').toUpperCase().includes(q)
    );
  }
  const filas = rows.map((r) => {
    const hoy = new Date();
    const regreso = new Date(r.fecha_regreso);
    const difDias = Math.ceil((regreso - hoy) / (1000 * 60 * 60 * 24));
    let estado = '—';
    if (difDias < 0) estado = 'FINALIZADO';
    else if (difDias === 0) estado = 'REGRESA HOY';
    else if (difDias <= 2) estado = 'REGRESA EN ' + difDias + ' DÍA(S)';
    else estado = 'EN CURSO';
    return {
      TRABAJADOR: r.nombre,
      DNI: r.dni,
      'FECHA SALIDA': fmtFecha(r.fecha_salida),
      'DÍAS SOLICITADOS': r.dias_vacaciones,
      'FECHA REGRESO': fmtFecha(r.fecha_regreso),
      'DÍAS DISPONIBLES': (cachePersonal.find((p) => p.id === r.personal_id)
        ? calcularDiasDisponibles(r.personal_id, cachePersonal.find((p) => p.id === r.personal_id).fecha_ingreso)
        : 0),
      ESTADO: estado,
    };
  });
  exportarExcel('vacaciones', 'VACACIONES', filas);
  notifyOk('EXCEL GENERADO.');
}

function verificarAlertas(host) {
  const alertaEl = host.querySelector('#vac-alerta');
  if (!alertaEl) return;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const alertas = [];
  for (const v of cacheVacaciones) {
    const regreso = new Date(v.fecha_regreso + 'T00:00:00');
    const dif = Math.ceil((regreso - hoy) / (1000 * 60 * 60 * 24));
    if (dif === 2) {
      alertas.push(`${v.nombre} regresa en 2 días (${fmtFecha(v.fecha_regreso)})`);
    }
  }
  if (alertas.length) {
    alertaEl.innerHTML = '<strong>&#9888; ALERTA:</strong> ' + alertas.join(' | ');
    alertaEl.style.display = 'block';
  } else {
    alertaEl.style.display = 'none';
  }
}

export async function iniciarPanelVacaciones(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      <div id="vac-alerta" class="vac-alerta" style="display:none;"></div>
      ${puedeEditar ? `
      <form id="vac-form" class="form-grid card op-form-card">
        <h3 class="sub-title">NUEVA SOLICITUD DE VACACIONES</h3>
        <div class="vac-autocomplete-wrap">
          <label>NOMBRES<input type="text" id="vac-nombres" class="input-upper" placeholder="ESCRIBA PARA BUSCAR..." autocomplete="off" /></label>
          <div id="vac-sugerencias" class="vac-sugerencias" style="display:none;"></div>
        </div>
        <label>DNI<input id="vac-dni" class="input-upper" readonly /></label>
        <label>FECHA DE INGRESO<input id="vac-fecha-ingreso" class="input-upper" readonly /></label>
        <label>TURNO<input id="vac-turno" class="input-upper" readonly /></label>
        <label>DÍAS DISPONIBLES <strong id="vac-dias-disponibles" data-disponibles="0">0</strong></label>
        <label>FECHA DE SALIDA<input id="vac-fecha-salida" type="date" class="input-upper" required /></label>
        <label>DÍAS SOLICITADOS<input id="vac-dias" type="number" class="input-upper" min="1" max="0" required /></label>
        <label>FECHA DE REGRESO<input id="vac-fecha-regreso" type="date" class="input-upper" /></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">GUARDAR SOLICITUD</button>
        </div>
      </form>
      ` : ''}
      <div class="filters-bar card">
        <label>BUSCAR<input id="vac-buscar" class="input-upper" placeholder="NOMBRE O DNI" /></label>
        <button type="button" class="btn btn-secondary" id="vac-excel">DESCARGAR EXCEL</button>
        ${puedeEditar ? '' : ''}
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TRABAJADOR</th><th>DNI</th><th>FECHA SALIDA</th><th>DÍAS</th><th>FECHA REGRESO</th><th>DÍAS DISPONIBLES</th><th>ESTADO</th><th>ACCIONES</th>
            </tr>
          </thead>
          <tbody id="vac-tbody"></tbody>
        </table>
      </div>
    </div>`;

  if (puedeEditar) {
    host.querySelector('#vac-form')?.addEventListener('submit', (ev) => onGuardarVacaciones(ev, host, true));
    host.querySelector('#vac-nombres')?.addEventListener('input', (e) => mostrarSugerencias(host, e.target.value));
    host.querySelector('#vac-nombres')?.addEventListener('blur', () => {
      setTimeout(() => { host.querySelector('#vac-sugerencias').style.display = 'none'; }, 200);
    });
    host.querySelector('#vac-fecha-salida')?.addEventListener('change', () => actualizarFechaRegreso(host));
    host.querySelector('#vac-dias')?.addEventListener('input', () => actualizarFechaRegreso(host));
    host.querySelector('#vac-fecha-regreso')?.addEventListener('change', () => {
      const salida = host.querySelector('#vac-fecha-salida')?.value;
      const regreso = host.querySelector('#vac-fecha-regreso')?.value;
      if (salida && regreso) {
        const dSalida = new Date(salida + 'T12:00:00');
        const dRegreso = new Date(regreso + 'T12:00:00');
        const diff = Math.round((dRegreso - dSalida) / (1000 * 60 * 60 * 24));
        if (diff > 0) host.querySelector('#vac-dias').value = diff;
      }
    });
    document.addEventListener('click', (e) => {
      if (!host.contains(e.target)) {
        const sug = host.querySelector('#vac-sugerencias');
        if (sug) sug.style.display = 'none';
      }
    });
  }

  host.querySelector('#vac-buscar')?.addEventListener('input', () => renderTablaHistorial(host));
  host.querySelector('#vac-excel')?.addEventListener('click', () => exportarExcelVacaciones(host));

  await cargarTodo(host);
  verificarAlertas(host);
}
