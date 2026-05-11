/**
 * Submódulo INCIDENCIAS — amonestaciones, permisos, faltas, suspensiones.
 */
import { supabase } from '../supabase-client.js';
import { notifyOk, notifyError } from '../utils/notifications.js';
import { exportarExcel } from '../utils/excel.js';

let cachePersonal = [];
let cacheIncidencias = [];
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

async function cargarTodo(host) {
  const [{ data: pa, error: e1 }, { data: inc, error: e2 }] = await Promise.all([
    supabase.from('personal_activo').select('id, nombres, dni, fecha_ingreso, turno, area').order('nombres'),
    supabase.from('incidencias').select('*').order('created_at', { ascending: false }),
  ]);
  if (e1) { notifyError(e1.message); return; }
  if (e2) { notifyError(e2.message); return; }
  cachePersonal = pa || [];
  cacheIncidencias = inc || [];
  renderTabla(host);
}

function mostrarSugerencias(host, query) {
  const lista = host.querySelector('#inc-sugerencias');
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
    item.className = 'inc-sug-item';
    item.textContent = `${p.nombres} — ${p.dni}`;
    item.addEventListener('click', () => seleccionarTrabajador(host, p));
    lista.appendChild(item);
  }
  lista.style.display = 'block';
}

function seleccionarTrabajador(host, personal) {
  currentPersonalId = personal.id;
  host.querySelector('#inc-nombre').value = personal.nombres;
  host.querySelector('#inc-dni').value = personal.dni;
  host.querySelector('#inc-fecha-ingreso').value = personal.fecha_ingreso;
  host.querySelector('#inc-turno').value = personal.turno;
  host.querySelector('#inc-area').value = personal.area;
  host.querySelector('#inc-sugerencias').style.display = 'none';
}

async function onGuardar(ev, host, puedeEditar) {
  ev.preventDefault();
  if (!puedeEditar) return;
  const nombre = host.querySelector('#inc-nombre')?.value?.trim() || '';
  const dni = host.querySelector('#inc-dni')?.value?.trim() || '';
  const tipo = host.querySelector('#inc-tipo')?.value || '';
  const gravedad = host.querySelector('#inc-gravedad')?.value || '';
  const fecha_incidencia = host.querySelector('#inc-fecha-incidencia')?.value || '';
  const descripcion = host.querySelector('#inc-descripcion')?.value?.trim() || '';
  const estado = host.querySelector('#inc-estado')?.value || 'Pendiente';
  const fecha_resolucion = host.querySelector('#inc-fecha-resolucion')?.value || null;

  if (!currentPersonalId || !nombre || !dni || !tipo || !gravedad || !fecha_incidencia) {
    notifyError('COMPLETE TODOS LOS CAMPOS OBLIGATORIOS.');
    return;
  }

  let documento_url = null;
  const fileInput = host.querySelector('#inc-documento');
  const file = fileInput?.files?.[0];
  if (file) {
    const ruta = `${currentPersonalId}/${Date.now()}_${file.name}`;
    const { data: upData, error: upErr } = await supabase.storage.from('incidencias').upload(ruta, file);
    if (upErr) { notifyError('ERROR AL SUBIR DOCUMENTO: ' + upErr.message); return; }
    documento_url = upData?.path || ruta;
  }

  const insertData = {
    personal_id: currentPersonalId,
    dni,
    nombre,
    tipo,
    gravedad,
    fecha_incidencia,
    descripcion,
    estado,
    fecha_resolucion: fecha_resolucion || null,
    documento_url,
  };

  if (editandoId) {
    const { error } = await supabase.from('incidencias').update(insertData).eq('id', editandoId);
    if (error) { notifyError(error.message); return; }
    notifyOk('INCIDENCIA ACTUALIZADA.');
  } else {
    const { error } = await supabase.from('incidencias').insert(insertData);
    if (error) { notifyError(error.message); return; }
    notifyOk('INCIDENCIA REGISTRADA.');
  }

  resetFormulario(host);
  await cargarTodo(host);
}

function resetFormulario(host) {
  host.querySelector('#inc-form')?.reset();
  currentPersonalId = null;
  editandoId = null;
  host.querySelector('#inc-dni').value = '';
  host.querySelector('#inc-fecha-ingreso').value = '';
  host.querySelector('#inc-turno').value = '';
  host.querySelector('#inc-area').value = '';
  const btn = host.querySelector('#inc-btn-guardar');
  if (btn) btn.textContent = 'GUARDAR INCIDENCIA';
  const titulo = host.querySelector('#inc-form-titulo');
  if (titulo) titulo.textContent = 'NUEVA INCIDENCIA';
}

async function onEliminar(host, id) {
  const { error } = await supabase.from('incidencias').delete().eq('id', id);
  if (error) { notifyError(error.message); return; }
  notifyOk('INCIDENCIA ELIMINADA.');
  await cargarTodo(host);
}

async function abrirDocumento(path) {
  if (!path) return;
  const { data } = await supabase.storage.from('incidencias').createSignedUrl(path, 120);
  if (data?.signedUrl) window.open(data.signedUrl, '_blank');
}

function verDetalle(host, id) {
  const r = cacheIncidencias.find((x) => x.id === id);
  if (!r) return;
  const dlg = host.querySelector('#inc-dlg-ver');
  if (!dlg) return;
  host.querySelector('#inc-ver-trabajador').textContent = r.nombre || '—';
  host.querySelector('#inc-ver-dni').textContent = r.dni || '—';
  host.querySelector('#inc-ver-tipo').textContent = r.tipo || '—';
  host.querySelector('#inc-ver-gravedad').textContent = r.gravedad || '—';
  host.querySelector('#inc-ver-fecha').textContent = fmtFecha(r.fecha_incidencia);
  host.querySelector('#inc-ver-estado').textContent = r.estado || '—';
  host.querySelector('#inc-ver-descripcion').textContent = r.descripcion || '—';
  host.querySelector('#inc-ver-resolucion').textContent = fmtFecha(r.fecha_resolucion);
  host.querySelector('#inc-ver-doc').style.display = r.documento_url ? 'inline-block' : 'none';
  host.querySelector('#inc-ver-doc').onclick = () => abrirDocumento(r.documento_url);
  dlg.showModal();
}

function prepararEdicion(host, id) {
  const r = cacheIncidencias.find((x) => x.id === id);
  if (!r) return;
  editandoId = id;
  currentPersonalId = r.personal_id;
  host.querySelector('#inc-nombre').value = r.nombre || '';
  host.querySelector('#inc-dni').value = r.dni || '';
  const per = cachePersonal.find((p) => p.id === r.personal_id);
  if (per) {
    host.querySelector('#inc-fecha-ingreso').value = per.fecha_ingreso || '';
    host.querySelector('#inc-turno').value = per.turno || '';
    host.querySelector('#inc-area').value = per.area || '';
  }
  host.querySelector('#inc-tipo').value = r.tipo || '';
  host.querySelector('#inc-gravedad').value = r.gravedad || '';
  host.querySelector('#inc-fecha-incidencia').value = r.fecha_incidencia || '';
  host.querySelector('#inc-descripcion').value = r.descripcion || '';
  host.querySelector('#inc-estado').value = r.estado || 'Pendiente';
  host.querySelector('#inc-fecha-resolucion').value = r.fecha_resolucion || '';
  host.querySelector('#inc-btn-guardar').textContent = 'ACTUALIZAR INCIDENCIA';
  host.querySelector('#inc-form-titulo').textContent = 'EDITAR INCIDENCIA';
  const form = host.querySelector('#inc-form');
  if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTabla(host) {
  const tbody = host.querySelector('#inc-tbody');
  if (!tbody) return;
  const q = (host.querySelector('#inc-buscar')?.value || '').trim().toUpperCase();
  const ftipo = host.querySelector('#inc-f-tipo')?.value || '';
  const fgrav = host.querySelector('#inc-f-gravedad')?.value || '';
  const fest = host.querySelector('#inc-f-estado')?.value || '';
  const fdesde = host.querySelector('#inc-f-desde')?.value || '';
  const fhasta = host.querySelector('#inc-f-hasta')?.value || '';

  let rows = [...cacheIncidencias];
  if (ftipo) rows = rows.filter((r) => r.tipo === ftipo);
  if (fgrav) rows = rows.filter((r) => r.gravedad === fgrav);
  if (fest) rows = rows.filter((r) => r.estado === fest);
  if (fdesde) rows = rows.filter((r) => r.fecha_incidencia >= fdesde);
  if (fhasta) rows = rows.filter((r) => r.fecha_incidencia <= fhasta);
  if (q) {
    rows = rows.filter((r) =>
      String(r.nombre || '').toUpperCase().includes(q) || String(r.dni || '').toUpperCase().includes(q)
    );
  }

  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:1rem;">SIN REGISTROS.</td></tr>';
    return;
  }

  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.nombre)}</td>
      <td>${esc(r.dni)}</td>
      <td>${esc(r.tipo)}</td>
      <td>${esc(r.gravedad)}</td>
      <td>${fmtFecha(r.fecha_incidencia)}</td>
      <td>${esc(r.estado)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm" data-inc-ver="${r.id}">VER</button>
        <button type="button" class="btn btn-sm btn-primary" data-inc-editar="${r.id}">EDITAR</button>
        <button type="button" class="btn btn-sm btn-danger" data-inc-eliminar="${r.id}">ELIMINAR</button>
      </td>`;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('[data-inc-ver]').forEach((b) =>
    b.addEventListener('click', () => verDetalle(host, b.getAttribute('data-inc-ver')))
  );
  tbody.querySelectorAll('[data-inc-editar]').forEach((b) =>
    b.addEventListener('click', () => prepararEdicion(host, b.getAttribute('data-inc-editar')))
  );
  tbody.querySelectorAll('[data-inc-eliminar]').forEach((b) =>
    b.addEventListener('click', () => {
      if (confirm('¿ELIMINAR ESTA INCIDENCIA?')) onEliminar(host, b.getAttribute('data-inc-eliminar'));
    })
  );
}

function exportarExcelIncidencias(host) {
  const q = (host.querySelector('#inc-buscar')?.value || '').trim().toUpperCase();
  const ftipo = host.querySelector('#inc-f-tipo')?.value || '';
  const fgrav = host.querySelector('#inc-f-gravedad')?.value || '';
  const fest = host.querySelector('#inc-f-estado')?.value || '';
  const fdesde = host.querySelector('#inc-f-desde')?.value || '';
  const fhasta = host.querySelector('#inc-f-hasta')?.value || '';
  let rows = [...cacheIncidencias];
  if (ftipo) rows = rows.filter((r) => r.tipo === ftipo);
  if (fgrav) rows = rows.filter((r) => r.gravedad === fgrav);
  if (fest) rows = rows.filter((r) => r.estado === fest);
  if (fdesde) rows = rows.filter((r) => r.fecha_incidencia >= fdesde);
  if (fhasta) rows = rows.filter((r) => r.fecha_incidencia <= fhasta);
  if (q) {
    rows = rows.filter((r) =>
      String(r.nombre || '').toUpperCase().includes(q) || String(r.dni || '').toUpperCase().includes(q)
    );
  }
  const filas = rows.map((r) => ({
    TRABAJADOR: r.nombre,
    DNI: r.dni,
    TIPO: r.tipo,
    GRAVEDAD: r.gravedad,
    'FECHA INCIDENCIA': fmtFecha(r.fecha_incidencia),
    DESCRIPCIÓN: r.descripcion,
    ESTADO: r.estado,
    'FECHA RESOLUCIÓN': fmtFecha(r.fecha_resolucion),
  }));
  exportarExcel('incidencias', 'INCIDENCIAS', filas);
  notifyOk('EXCEL GENERADO.');
}

export async function iniciarPanelIncidencias(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      <dialog id="inc-dlg-ver" class="modal">
        <form class="form-grid">
          <h3 class="sub-title">DETALLE DE INCIDENCIA</h3>
          <label>TRABAJADOR <span id="inc-ver-trabajador"></span></label>
          <label>DNI <span id="inc-ver-dni"></span></label>
          <label>TIPO <span id="inc-ver-tipo"></span></label>
          <label>GRAVEDAD <span id="inc-ver-gravedad"></span></label>
          <label>FECHA <span id="inc-ver-fecha"></span></label>
          <label>ESTADO <span id="inc-ver-estado"></span></label>
          <label>DESCRIPCIÓN <span id="inc-ver-descripcion"></span></label>
          <label>FECHA RESOLUCIÓN <span id="inc-ver-resolucion"></span></label>
          <button type="button" class="btn btn-accent" id="inc-ver-doc" style="display:none;">VER DOCUMENTO</button>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" onclick="this.closest('dialog').close()">CERRAR</button>
          </div>
        </form>
      </dialog>

      ${puedeEditar ? `
      <form id="inc-form" class="form-grid card op-form-card">
        <h3 class="sub-title" id="inc-form-titulo">NUEVA INCIDENCIA</h3>
        <div class="inc-autocomplete-wrap">
          <label>NOMBRE<input type="text" id="inc-nombre" class="input-upper" placeholder="ESCRIBA PARA BUSCAR..." autocomplete="off" /></label>
          <div id="inc-sugerencias" class="inc-sugerencias" style="display:none;"></div>
        </div>
        <label>DNI<input id="inc-dni" class="input-upper" readonly /></label>
        <label>FECHA DE INGRESO<input id="inc-fecha-ingreso" class="input-upper" readonly /></label>
        <label>TURNO<input id="inc-turno" class="input-upper" readonly /></label>
        <label>ÁREA<input id="inc-area" class="input-upper" readonly /></label>
        <label>TIPO
          <select id="inc-tipo" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="Amonestación">AMONESTACIÓN</option>
            <option value="Permiso">PERMISO</option>
            <option value="Falta">FALTA</option>
            <option value="Suspensión">SUSPENSIÓN</option>
            <option value="Otro">OTRO</option>
          </select>
        </label>
        <label>GRAVEDAD
          <select id="inc-gravedad" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="Leve">LEVE</option>
            <option value="Grave">GRAVE</option>
            <option value="Muy grave">MUY GRAVE</option>
          </select>
        </label>
        <label>FECHA DE INCIDENCIA<input id="inc-fecha-incidencia" type="date" class="input-upper" required /></label>
        <label>DESCRIPCIÓN<textarea id="inc-descripcion" class="input-upper" rows="3"></textarea></label>
        <label>ESTADO
          <select id="inc-estado" class="input-upper">
            <option value="Pendiente">PENDIENTE</option>
            <option value="Resuelta">RESUELTA</option>
            <option value="Archivada">ARCHIVADA</option>
          </select>
        </label>
        <label>FECHA DE RESOLUCIÓN<input id="inc-fecha-resolucion" type="date" class="input-upper" /></label>
        <label>DOCUMENTO<input type="file" id="inc-documento" class="input-upper" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" /></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="inc-btn-guardar">GUARDAR INCIDENCIA</button>
          ${editandoId ? `<button type="button" class="btn btn-ghost" id="inc-btn-cancelar-edit">CANCELAR EDICIÓN</button>` : ''}
        </div>
      </form>
      ` : ''}

      <div class="filters-bar card">
        <label>BUSCAR<input id="inc-buscar" class="input-upper" placeholder="NOMBRE O DNI" /></label>
        <label>TIPO
          <select id="inc-f-tipo" class="input-upper">
            <option value="">TODOS</option>
            <option value="Amonestación">AMONESTACIÓN</option>
            <option value="Permiso">PERMISO</option>
            <option value="Falta">FALTA</option>
            <option value="Suspensión">SUSPENSIÓN</option>
            <option value="Otro">OTRO</option>
          </select>
        </label>
        <label>GRAVEDAD
          <select id="inc-f-gravedad" class="input-upper">
            <option value="">TODAS</option>
            <option value="Leve">LEVE</option>
            <option value="Grave">GRAVE</option>
            <option value="Muy grave">MUY GRAVE</option>
          </select>
        </label>
        <label>ESTADO
          <select id="inc-f-estado" class="input-upper">
            <option value="">TODOS</option>
            <option value="Pendiente">PENDIENTE</option>
            <option value="Resuelta">RESUELTA</option>
            <option value="Archivada">ARCHIVADA</option>
          </select>
        </label>
        <label>DESDE<input id="inc-f-desde" type="date" class="input-upper" /></label>
        <label>HASTA<input id="inc-f-hasta" type="date" class="input-upper" /></label>
        <button type="button" class="btn btn-secondary" id="inc-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>TRABAJADOR</th><th>DNI</th><th>TIPO</th><th>GRAVEDAD</th><th>FECHA</th><th>ESTADO</th><th>ACCIONES</th>
            </tr>
          </thead>
          <tbody id="inc-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const hoy = new Date().toISOString().slice(0, 10);
  host.querySelector('#inc-fecha-incidencia').value = hoy;

  if (puedeEditar) {
    host.querySelector('#inc-form')?.addEventListener('submit', (ev) => onGuardar(ev, host, true));
    host.querySelector('#inc-nombre')?.addEventListener('input', (e) => mostrarSugerencias(host, e.target.value));
    host.querySelector('#inc-nombre')?.addEventListener('blur', () => {
      setTimeout(() => { const s = host.querySelector('#inc-sugerencias'); if (s) s.style.display = 'none'; }, 200);
    });
    host.querySelector('#inc-btn-cancelar-edit')?.addEventListener('click', () => resetFormulario(host));
    document.addEventListener('click', (e) => {
      if (!host.contains(e.target)) {
        const sug = host.querySelector('#inc-sugerencias');
        if (sug) sug.style.display = 'none';
      }
    });
  }

  host.querySelector('#inc-buscar')?.addEventListener('input', () => renderTabla(host));
  ['#inc-f-tipo', '#inc-f-gravedad', '#inc-f-estado', '#inc-f-desde', '#inc-f-hasta'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('change', () => renderTabla(host));
  });
  host.querySelector('#inc-excel')?.addEventListener('click', () => exportarExcelIncidencias(host));

  await cargarTodo(host);
}
