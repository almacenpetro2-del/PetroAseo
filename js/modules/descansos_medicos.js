/**
 * Submódulo DESCANSOS MÉDICOS — certificados de reposo.
 */
import { supabase } from '../supabase-client.js';
import { notifyOk, notifyError } from '../utils/notifications.js';
import { exportarExcel } from '../utils/excel.js';

let cachePersonal = [];
let cacheDescansos = [];
let currentPersonalId = null;
let editandoId = null;

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

function calcularDias(inicio, fin) {
  if (!inicio || !fin) return 0;
  const d1 = new Date(inicio + 'T12:00:00');
  const d2 = new Date(fin + 'T12:00:00');
  const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, diff);
}

async function cargarTodo(host) {
  const [{ data: pa, error: e1 }, { data: dm, error: e2 }] = await Promise.all([
    supabase.from('personal_activo').select('id, nombres, dni, fecha_ingreso, turno, area').order('nombres'),
    supabase.from('descansos_medicos').select('*').order('created_at', { ascending: false }),
  ]);
  if (e1) { notifyError(e1.message); return; }
  if (e2) { notifyError(e2.message); return; }
  cachePersonal = pa || [];
  cacheDescansos = dm || [];
  renderTabla(host);
  verificarAlertas(host);
}

function mostrarSugerencias(host, query) {
  const lista = host.querySelector('#dm-sugerencias');
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
    item.className = 'dm-sug-item';
    item.textContent = `${p.nombres} — ${p.dni}`;
    item.addEventListener('click', () => seleccionarTrabajador(host, p));
    lista.appendChild(item);
  }
  lista.style.display = 'block';
}

function seleccionarTrabajador(host, personal) {
  currentPersonalId = personal.id;
  host.querySelector('#dm-nombre').value = personal.nombres;
  host.querySelector('#dm-dni').value = personal.dni;
  host.querySelector('#dm-fecha-ingreso').value = personal.fecha_ingreso;
  host.querySelector('#dm-turno').value = personal.turno;
  host.querySelector('#dm-area').value = personal.area;
  host.querySelector('#dm-sugerencias').style.display = 'none';
  actualizarDias(host);
}

function actualizarDias(host) {
  const inicio = host.querySelector('#dm-fecha-inicio')?.value;
  const fin = host.querySelector('#dm-fecha-fin')?.value;
  const dias = calcularDias(inicio, fin);
  host.querySelector('#dm-dias-descanso').textContent = dias;
}

async function onGuardar(ev, host, puedeEditar) {
  ev.preventDefault();
  if (!puedeEditar) return;
  const nombre = host.querySelector('#dm-nombre')?.value?.trim() || '';
  const dni = host.querySelector('#dm-dni')?.value?.trim() || '';
  const motivo = host.querySelector('#dm-motivo')?.value?.trim() || '';
  const fecha_inicio = host.querySelector('#dm-fecha-inicio')?.value || '';
  const fecha_fin = host.querySelector('#dm-fecha-fin')?.value || '';
  const diagnostico = host.querySelector('#dm-diagnostico')?.value?.trim() || '';
  const medico_tratante = host.querySelector('#dm-medico')?.value?.trim() || '';
  const nro_certificado = host.querySelector('#dm-nro-cert')?.value?.trim() || '';
  const estado = host.querySelector('#dm-estado')?.value || 'Activo';
  const dias_descanso = calcularDias(fecha_inicio, fecha_fin);

  if (!currentPersonalId || !nombre || !dni || !motivo || !fecha_inicio || !fecha_fin || !dias_descanso) {
    notifyError('COMPLETE TODOS LOS CAMPOS OBLIGATORIOS.');
    return;
  }
  if (fecha_fin < fecha_inicio) {
    notifyError('FECHA FIN DEBE SER POSTERIOR A FECHA INICIO.');
    return;
  }

  let documento_url = null;
  const fileInput = host.querySelector('#dm-documento');
  const file = fileInput?.files?.[0];
  if (file) {
    const ruta = `${currentPersonalId}/${Date.now()}_${file.name}`;
    const { data: upData, error: upErr } = await supabase.storage.from('descansos').upload(ruta, file);
    if (upErr) { notifyError('ERROR AL SUBIR DOCUMENTO: ' + upErr.message); return; }
    documento_url = upData?.path || ruta;
  }

  const data = {
    personal_id: currentPersonalId, dni, nombre, motivo,
    fecha_inicio, fecha_fin, dias_descanso,
    diagnostico, medico_tratante, nro_certificado, estado, documento_url,
  };

  if (editandoId) {
    const { error } = await supabase.from('descansos_medicos').update(data).eq('id', editandoId);
    if (error) { notifyError(error.message); return; }
    notifyOk('DESCANSO MÉDICO ACTUALIZADO.');
  } else {
    const { error } = await supabase.from('descansos_medicos').insert(data);
    if (error) { notifyError(error.message); return; }
    notifyOk('DESCANSO MÉDICO REGISTRADO.');
  }

  resetFormulario(host);
  await cargarTodo(host);
}

function resetFormulario(host) {
  host.querySelector('#dm-form')?.reset();
  currentPersonalId = null;
  editandoId = null;
  host.querySelector('#dm-dni').value = '';
  host.querySelector('#dm-fecha-ingreso').value = '';
  host.querySelector('#dm-turno').value = '';
  host.querySelector('#dm-area').value = '';
  host.querySelector('#dm-dias-descanso').textContent = '0';
  const btn = host.querySelector('#dm-btn-guardar');
  if (btn) btn.textContent = 'GUARDAR DESCANSO';
  const titulo = host.querySelector('#dm-form-titulo');
  if (titulo) titulo.textContent = 'NUEVO DESCANSO MÉDICO';
}

async function onEliminar(host, id) {
  const { error } = await supabase.from('descansos_medicos').delete().eq('id', id);
  if (error) { notifyError(error.message); return; }
  notifyOk('DESCANSO ELIMINADO.');
  await cargarTodo(host);
}

async function abrirDocumento(path) {
  if (!path) return;
  const { data } = await supabase.storage.from('descansos').createSignedUrl(path, 120);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
}

function verDetalle(host, id) {
  const r = cacheDescansos.find((x) => x.id === id);
  if (!r) return;
  const dlg = host.querySelector('#dm-dlg-ver');
  if (!dlg) return;
  host.querySelector('#dm-ver-trabajador').textContent = r.nombre || '—';
  host.querySelector('#dm-ver-dni').textContent = r.dni || '—';
  host.querySelector('#dm-ver-motivo').textContent = r.motivo || '—';
  host.querySelector('#dm-ver-inicio').textContent = fmtFecha(r.fecha_inicio);
  host.querySelector('#dm-ver-fin').textContent = fmtFecha(r.fecha_fin);
  host.querySelector('#dm-ver-dias').textContent = r.dias_descanso;
  host.querySelector('#dm-ver-estado').textContent = r.estado || '—';
  host.querySelector('#dm-ver-diagnostico').textContent = r.diagnostico || '—';
  host.querySelector('#dm-ver-medico').textContent = r.medico_tratante || '—';
  host.querySelector('#dm-ver-cert').textContent = r.nro_certificado || '—';
  host.querySelector('#dm-ver-doc').style.display = r.documento_url ? 'inline-block' : 'none';
  host.querySelector('#dm-ver-doc').onclick = () => abrirDocumento(r.documento_url);
  dlg.showModal();
}

function prepararEdicion(host, id) {
  const r = cacheDescansos.find((x) => x.id === id);
  if (!r) return;
  editandoId = id;
  currentPersonalId = r.personal_id;
  host.querySelector('#dm-nombre').value = r.nombre || '';
  host.querySelector('#dm-dni').value = r.dni || '';
  const per = cachePersonal.find((p) => p.id === r.personal_id);
  if (per) {
    host.querySelector('#dm-fecha-ingreso').value = per.fecha_ingreso || '';
    host.querySelector('#dm-turno').value = per.turno || '';
    host.querySelector('#dm-area').value = per.area || '';
  }
  host.querySelector('#dm-motivo').value = r.motivo || '';
  host.querySelector('#dm-fecha-inicio').value = r.fecha_inicio || '';
  host.querySelector('#dm-fecha-fin').value = r.fecha_fin || '';
  host.querySelector('#dm-diagnostico').value = r.diagnostico || '';
  host.querySelector('#dm-medico').value = r.medico_tratante || '';
  host.querySelector('#dm-nro-cert').value = r.nro_certificado || '';
  host.querySelector('#dm-estado').value = r.estado || 'Activo';
  actualizarDias(host);
  host.querySelector('#dm-btn-guardar').textContent = 'ACTUALIZAR DESCANSO';
  host.querySelector('#dm-form-titulo').textContent = 'EDITAR DESCANSO MÉDICO';
  host.querySelector('#dm-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTabla(host) {
  const tbody = host.querySelector('#dm-tbody');
  if (!tbody) return;
  const q = (host.querySelector('#dm-buscar')?.value || '').trim().toUpperCase();
  const fest = host.querySelector('#dm-f-estado')?.value || '';
  const fdesde = host.querySelector('#dm-f-desde')?.value || '';
  const fhasta = host.querySelector('#dm-f-hasta')?.value || '';
  let rows = [...cacheDescansos];
  if (fest) rows = rows.filter((r) => r.estado === fest);
  if (fdesde) rows = rows.filter((r) => r.fecha_inicio >= fdesde);
  if (fhasta) rows = rows.filter((r) => r.fecha_fin <= fhasta);
  if (q) {
    rows = rows.filter((r) =>
      String(r.nombre || '').toUpperCase().includes(q) || String(r.dni || '').toUpperCase().includes(q)
    );
  }
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:1rem;">SIN REGISTROS.</td></tr>';
    return;
  }
  for (const r of rows) {
    const hoy = new Date();
    const fin = new Date(r.fecha_fin);
    const dif = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    if (dif < 0 && r.estado === 'Activo') r.estado = 'Finalizado';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.nombre)}</td>
      <td>${esc(r.dni)}</td>
      <td>${fmtFecha(r.fecha_inicio)}</td>
      <td>${fmtFecha(r.fecha_fin)}</td>
      <td>${r.dias_descanso}</td>
      <td>${esc(r.motivo)}</td>
      <td>${esc(r.estado)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm" data-dm-ver="${r.id}">VER</button>
        <button type="button" class="btn btn-sm btn-primary" data-dm-editar="${r.id}">EDITAR</button>
        <button type="button" class="btn btn-sm btn-danger" data-dm-eliminar="${r.id}">ELIMINAR</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-dm-ver]').forEach((b) =>
    b.addEventListener('click', () => verDetalle(host, b.getAttribute('data-dm-ver')))
  );
  tbody.querySelectorAll('[data-dm-editar]').forEach((b) =>
    b.addEventListener('click', () => prepararEdicion(host, b.getAttribute('data-dm-editar')))
  );
  tbody.querySelectorAll('[data-dm-eliminar]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('¿ELIMINAR ESTE DESCANSO MÉDICO?')) onEliminar(host, b.getAttribute('data-dm-eliminar'));
    })
  );
}

function exportarExcelDescansos(host) {
  const q = (host.querySelector('#dm-buscar')?.value || '').trim().toUpperCase();
  const fest = host.querySelector('#dm-f-estado')?.value || '';
  const fdesde = host.querySelector('#dm-f-desde')?.value || '';
  const fhasta = host.querySelector('#dm-f-hasta')?.value || '';
  let rows = [...cacheDescansos];
  if (fest) rows = rows.filter((r) => r.estado === fest);
  if (fdesde) rows = rows.filter((r) => r.fecha_inicio >= fdesde);
  if (fhasta) rows = rows.filter((r) => r.fecha_fin <= fhasta);
  if (q) {
    rows = rows.filter((r) =>
      String(r.nombre || '').toUpperCase().includes(q) || String(r.dni || '').toUpperCase().includes(q)
    );
  }
  const filas = rows.map((r) => ({
    TRABAJADOR: r.nombre,
    DNI: r.dni,
    'FECHA INICIO': fmtFecha(r.fecha_inicio),
    'FECHA FIN': fmtFecha(r.fecha_fin),
    'DÍAS': r.dias_descanso,
    MOTIVO: r.motivo,
    DIAGNÓSTICO: r.diagnostico,
    'MÉDICO TRATANTE': r.medico_tratante,
    'NRO CERTIFICADO': r.nro_certificado,
    ESTADO: r.estado,
  }));
  exportarExcel('descansos_medicos', 'DESCANSOS_MEDICOS', filas);
  notifyOk('EXCEL GENERADO.');
}

function verificarAlertas(host) {
  const alertaEl = host.querySelector('#dm-alerta');
  if (!alertaEl) return;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const alertas = [];
  for (const d of cacheDescansos) {
    if (d.estado !== 'Activo') continue;
    const fin = new Date(d.fecha_fin + 'T00:00:00');
    const dif = Math.ceil((fin - hoy) / (1000 * 60 * 60 * 24));
    if (dif >= 0 && dif <= 2) {
      alertas.push(`${d.nombre}: ${dif === 0 ? 'FINALIZA HOY' : 'FALTAN ' + dif + ' DÍA(S)'} (${fmtFecha(d.fecha_fin)})`);
    }
  }
  if (alertas.length) {
    alertaEl.innerHTML = '<strong>&#9888; ALERTA:</strong> ' + alertas.join(' | ');
    alertaEl.style.display = 'block';
  } else {
    alertaEl.style.display = 'none';
  }
}

export async function iniciarPanelDescansosMedicos(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      <div id="dm-alerta" class="dm-alerta" style="display:none;"></div>
      <dialog id="dm-dlg-ver" class="modal">
        <form class="form-grid">
          <h3 class="sub-title">DETALLE DE DESCANSO MÉDICO</h3>
          <label>TRABAJADOR <span id="dm-ver-trabajador"></span></label>
          <label>DNI <span id="dm-ver-dni"></span></label>
          <label>MOTIVO <span id="dm-ver-motivo"></span></label>
          <label>FECHA INICIO <span id="dm-ver-inicio"></span></label>
          <label>FECHA FIN <span id="dm-ver-fin"></span></label>
          <label>DÍAS <span id="dm-ver-dias"></span></label>
          <label>ESTADO <span id="dm-ver-estado"></span></label>
          <label>DIAGNÓSTICO <span id="dm-ver-diagnostico"></span></label>
          <label>MÉDICO TRATANTE <span id="dm-ver-medico"></span></label>
          <label>NRO CERTIFICADO <span id="dm-ver-cert"></span></label>
          <button type="button" class="btn btn-accent" id="dm-ver-doc" style="display:none;">VER DOCUMENTO</button>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onclick="this.closest('dialog').close()">CERRAR</button>
          </div>
        </form>
      </dialog>

      ${puedeEditar ? `
      <form id="dm-form" class="form-grid card op-form-card">
        <h3 class="sub-title" id="dm-form-titulo">NUEVO DESCANSO MÉDICO</h3>
        <div class="dm-autocomplete-wrap">
          <label>NOMBRE<input type="text" id="dm-nombre" class="input-upper" placeholder="ESCRIBA PARA BUSCAR..." autocomplete="off" /></label>
          <div id="dm-sugerencias" class="dm-sugerencias" style="display:none;"></div>
        </div>
        <label>DNI<input id="dm-dni" class="input-upper" readonly /></label>
        <label>FECHA DE INGRESO<input id="dm-fecha-ingreso" class="input-upper" readonly /></label>
        <label>TURNO<input id="dm-turno" class="input-upper" readonly /></label>
        <label>ÁREA<input id="dm-area" class="input-upper" readonly /></label>
        <label>MOTIVO<input id="dm-motivo" class="input-upper" required /></label>
        <label>FECHA INICIO<input id="dm-fecha-inicio" type="date" class="input-upper" required /></label>
        <label>FECHA FIN<input id="dm-fecha-fin" type="date" class="input-upper" required /></label>
        <label>DÍAS DE DESCANSO <strong id="dm-dias-descanso">0</strong></label>
        <label>DIAGNÓSTICO<textarea id="dm-diagnostico" class="input-upper" rows="2"></textarea></label>
        <label>MÉDICO TRATANTE<input id="dm-medico" class="input-upper" /></label>
        <label>NRO CERTIFICADO<input id="dm-nro-cert" class="input-upper" /></label>
        <label>ESTADO
          <select id="dm-estado" class="input-upper">
            <option value="Activo">ACTIVO</option>
            <option value="Finalizado">FINALIZADO</option>
          </select>
        </label>
        <label>DOCUMENTO<input type="file" id="dm-documento" class="input-upper" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="dm-btn-guardar">GUARDAR DESCANSO</button>
          ${editandoId ? `<button type="button" class="btn btn-ghost" id="dm-btn-cancelar-edit">CANCELAR EDICIÓN</button>` : ''}
        </div>
      </form>
      ` : ''}

      <div class="filters-bar card">
        <label>BUSCAR<input id="dm-buscar" class="input-upper" placeholder="NOMBRE O DNI" /></label>
        <label>ESTADO
          <select id="dm-f-estado" class="input-upper">
            <option value="">TODOS</option>
            <option value="Activo">ACTIVO</option>
            <option value="Finalizado">FINALIZADO</option>
          </select>
        </label>
        <label>DESDE<input id="dm-f-desde" type="date" class="input-upper" /></label>
        <label>HASTA<input id="dm-f-hasta" type="date" class="input-upper" /></label>
        <button type="button" class="btn btn-secondary" id="dm-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TRABAJADOR</th><th>DNI</th><th>F. INICIO</th><th>F. FIN</th><th>DÍAS</th><th>MOTIVO</th><th>ESTADO</th><th>ACCIONES</th>
            </tr>
          </thead>
          <tbody id="dm-tbody"></tbody>
        </table>
      </div>
    </div>`;

  if (puedeEditar) {
    host.querySelector('#dm-form')?.addEventListener('submit', (ev) => onGuardar(ev, host, true));
    host.querySelector('#dm-nombre')?.addEventListener('input', (e) => mostrarSugerencias(host, e.target.value));
    host.querySelector('#dm-nombre')?.addEventListener('blur', () => {
      setTimeout(() => { const s = host.querySelector('#dm-sugerencias'); if (s) s.style.display = 'none'; }, 200);
    });
    host.querySelector('#dm-fecha-inicio')?.addEventListener('change', () => actualizarDias(host));
    host.querySelector('#dm-fecha-fin')?.addEventListener('change', () => actualizarDias(host));
    host.querySelector('#dm-btn-cancelar-edit')?.addEventListener('click', () => resetFormulario(host));
    document.addEventListener('click', (e) => {
      if (!host.contains(e.target)) {
        const sug = host.querySelector('#dm-sugerencias');
        if (sug) sug.style.display = 'none';
      }
    });
  }

  host.querySelector('#dm-buscar')?.addEventListener('input', () => renderTabla(host));
  ['#dm-f-estado', '#dm-f-desde', '#dm-f-hasta'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('change', () => renderTabla(host));
  });
  host.querySelector('#dm-excel')?.addEventListener('click', () => exportarExcelDescansos(host));

  await cargarTodo(host);
}
