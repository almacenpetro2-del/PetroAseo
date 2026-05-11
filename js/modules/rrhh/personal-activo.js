/**
 * Submódulo RRHH — PERSONAL ACTIVO (altas, filtros, cese con RPC).
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { requerido } from '../../utils/validators.js';
import { formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';

/** Cache local para filtrar sin recargar. */
let cacheActivo = [];

/** Último contenedor montado (para refresco tras reincorporación). */
let hostActivoRef = null;

/** Id del registro abierto en el modal de cese. */
let ceseIdActual = null;

function onActualizadoActivoExterno() {
  if (hostActivoRef) cargarActivo(hostActivoRef, hostActivoRef._puedeEditarActivo ?? false);
}

window.addEventListener('petroaseo:personal-activo-actualizado', onActualizadoActivoExterno);

/**
 * Escapa HTML para textos en tabla.
 * @param {string|number|null|undefined} t Texto
 * @returns {string} Seguro para innerHTML
 */
function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Filtra personal activo según criterios de UI.
 * @param {Array<object>} rows Filas
 * @param {string} area Área o vacío
 * @param {string} turno Turno o vacío
 * @param {string} q Nombre o DNI
 * @returns {Array<object>} Filtradas
 */
function filtrarActivo(rows, area, turno, q) {
  const qt = (q || '').trim().toUpperCase();
  return rows.filter((r) => {
    if (area && r.area !== area) return false;
    if (turno && r.turno !== turno) return false;
    if (qt) {
      const n = String(r.nombres || '').toUpperCase();
      const d = String(r.dni || '').toUpperCase();
      const c = String(r.celular || '').toUpperCase();
      if (!n.includes(qt) && !d.includes(qt) && !c.includes(qt)) return false;
    }
    return true;
  });
}

/**
 * Dibuja la tabla de personal activo.
 * @param {HTMLElement} root Contenedor submódulo
 * @param {boolean} puedeEditar Muestra formulario y CESAR
 */
function renderTablaActivo(root, puedeEditar) {
  const tbody = root.querySelector('#pa-tbody');
  if (!tbody) return;
  const area = root.querySelector('#pa-f-area')?.value || '';
  const turno = root.querySelector('#pa-f-turno')?.value || '';
  const q = root.querySelector('#pa-buscar')?.value || '';
  const rows = filtrarActivo(cacheActivo, area, turno, q);
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.nombres)}</td>
      <td>${esc(r.dni)}</td>
      <td>${esc(r.celular)}</td>
      <td>${esc(r.turno)}</td>
      <td>${esc(r.area)}</td>
      <td>${esc(r.modalidad)}</td>
      <td>${esc(r.talla_zapato)}</td>
      <td>${esc(r.talla_polo)}</td>
      <td>${esc(r.talla_pantalon)}</td>
      <td>${esc(formatearFecha(r.fecha_ingreso))}</td>
      <td class="table-actions">
        ${
          puedeEditar
            ? `<button type="button" class="btn btn-sm btn-danger" data-pa-cesar="${r.id}">CESAR</button>`
            : ''
        }
      </td>`;
    tbody.appendChild(tr);
  }
  if (puedeEditar) {
    tbody.querySelectorAll('[data-pa-cesar]').forEach((b) =>
      b.addEventListener('click', () => abrirModalCese(root, b.getAttribute('data-pa-cesar'))),
    );
  }
}

/**
 * Carga personal activo desde Supabase.
 * @param {HTMLElement} root Raíz
 * @param {boolean} puedeEditar Permisos
 */
async function cargarActivo(root, puedeEditar) {
  const { data, error } = await supabase.from('personal_activo').select('*').order('nombres');
  if (error) {
    notifyError(error.message);
    cacheActivo = [];
    renderTablaActivo(root, puedeEditar);
    return;
  }
  cacheActivo = data || [];
  renderTablaActivo(root, puedeEditar);
}

/**
 * Exporta filas filtradas a Excel.
 * @param {HTMLElement} root Raíz
 */
function exportarExcelActivo(root) {
  const area = root.querySelector('#pa-f-area')?.value || '';
  const turno = root.querySelector('#pa-f-turno')?.value || '';
  const q = root.querySelector('#pa-buscar')?.value || '';
  const rows = filtrarActivo(cacheActivo, area, turno, q);
  const filas = rows.map((r) => ({
    NOMBRES: r.nombres,
    DNI: r.dni,
    CELULAR: r.celular,
    TURNO: r.turno,
    ÁREA: r.area,
    MODALIDAD: r.modalidad,
    'TALLA ZAPATO': r.talla_zapato,
    'TALLA POLO': r.talla_polo,
    'TALLA PANTALÓN': r.talla_pantalon,
    'FECHA INGRESO': formatearFecha(r.fecha_ingreso),
  }));
  exportarExcel('personal_activo', 'PERSONAL_ACTIVO', filas);
  notifyOk('EXCEL GENERADO.');
}

/**
 * Muestra u oculta el formulario de nuevo personal.
 * @param {HTMLElement} root Raíz
 */
function toggleFormActivo(root) {
  const form = root.querySelector('#pa-form');
  if (!form) return;
  form.hidden = !form.hidden;
}

/**
 * Guarda nuevo personal activo.
 * @param {Event} ev Submit
 * @param {HTMLElement} root Raíz
 * @param {boolean} puedeEditar Si puede insertar
 */
async function onGuardarPersonal(ev, root, puedeEditar) {
  ev.preventDefault();
  if (!puedeEditar) return;
  const nombres = root.querySelector('#pa-nombres')?.value?.trim() || '';
  const dni = root.querySelector('#pa-dni')?.value?.trim() || '';
  const celular = root.querySelector('#pa-cel')?.value?.trim() || '';
  const turno = root.querySelector('#pa-turno')?.value || '';
  const area = root.querySelector('#pa-area')?.value || '';
  const modalidad = root.querySelector('#pa-modalidad')?.value || '';
  const talla_zapato = root.querySelector('#pa-zap')?.value?.trim() || '';
  const talla_polo = root.querySelector('#pa-polo')?.value?.trim() || '';
  const talla_pantalon = root.querySelector('#pa-pant')?.value?.trim() || '';
  const fecha_ingreso = root.querySelector('#pa-fecha')?.value || '';
  if (!requerido(nombres) || !requerido(dni) || !requerido(celular) || !requerido(turno) || !requerido(area) || !requerido(modalidad) || !requerido(fecha_ingreso)) {
    notifyError('COMPLETE LOS CAMPOS OBLIGATORIOS.');
    return;
  }
  try {
    const { data: nuevo, error } = await supabase.from('personal_activo').insert({
      nombres,
      dni,
      celular,
      turno,
      area,
      modalidad,
      talla_zapato,
      talla_polo,
      talla_pantalon,
      fecha_ingreso,
    }).select('id').single();
    if (error) {
      if (error.code === '23505') throw new Error('DNI DUPLICADO.');
      throw error;
    }
    if (nuevo) {
      const fechaIng = fecha_ingreso ? new Date(fecha_ingreso + 'T00:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
      supabase.from('notificaciones').insert({
        mensaje: `NUEVO PERSONAL: ${nombres}. INGRESA: ${fechaIng}. SE REQUIERE ASIGNAR EPP.`,
        tipo: 'nuevo_personal',
        referencia_id: nuevo.id,
      }).then(({ error: eNotif }) => { if (eNotif) console.error(eNotif); });
    }
    notifyOk('PERSONAL GUARDADO.');
    root.querySelector('#pa-form')?.reset();
    const fi = root.querySelector('#pa-fecha');
    if (fi) fi.value = new Date().toISOString().slice(0, 10);
    await cargarActivo(root, puedeEditar);
  } catch (e) {
    console.error(e);
    notifyError(e.message || 'ERROR AL GUARDAR.');
  }
}

/**
 * Abre el modal de cese con datos del registro seleccionado.
 * @param {HTMLElement} root Raíz
 * @param {string|null} id UUID personal activo
 */
function abrirModalCese(root, id) {
  const row = cacheActivo.find((x) => x.id === id);
  if (!row) return;
  ceseIdActual = id;
  const dlg = root.querySelector('#pa-dlg-cese');
  if (!dlg) return;
  root.querySelector('#ce-nombre').value = row.nombres;
  root.querySelector('#ce-dni').value = row.dni;
  root.querySelector('#ce-fecha').value = new Date().toISOString().slice(0, 10);
  root.querySelector('#ce-motivo').value = '';
  /** @type {HTMLDialogElement} */ (dlg).showModal();
}

/**
 * Cierra el modal de cese sin confirmar.
 * @param {HTMLElement} root Raíz
 */
function cerrarModalCese(root) {
  const dlg = root.querySelector('#pa-dlg-cese');
  if (dlg) /** @type {HTMLDialogElement} */ (dlg).close();
  ceseIdActual = null;
}

/**
 * Confirma cese vía RPC atómica.
 * @param {HTMLElement} root Raíz
 * @param {boolean} puedeEditar Permiso
 */
async function confirmarCese(root, puedeEditar) {
  if (!puedeEditar || !ceseIdActual) return;
  const fecha_cese = root.querySelector('#ce-fecha')?.value || '';
  const motivo = root.querySelector('#ce-motivo')?.value?.trim() || '';
  if (!requerido(fecha_cese) || !requerido(motivo)) {
    notifyError('INDIQUE FECHA Y MOTIVO DE CESE.');
    return;
  }
  try {
    const { error } = await supabase.rpc('cesar_personal', {
      p_id: ceseIdActual,
      p_fecha_cese: fecha_cese,
      p_motivo: motivo,
    });
    if (error) throw error;
    notifyOk('PERSONAL CESADO CORRECTAMENTE.');
    cerrarModalCese(root);
    await cargarActivo(root, puedeEditar);
    window.dispatchEvent(new CustomEvent('petroaseo:personal-cesado-actualizado'));
  } catch (e) {
    console.error(e);
    notifyError(e.message || 'ERROR AL CESAR.');
  }
}

function normalizarHeader(h) {
  return String(h || '').trim().toUpperCase()
    .replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U')
    .replace(/\s+/g, ' ');
}

const COL_MAP = {
  'NOMBRES': 'nombres', 'NOMBRES COMPLETOS': 'nombres', 'NOMBRE': 'nombres',
  'DNI': 'dni',
  'CELULAR': 'celular', 'CEL': 'celular',
  'TURNO': 'turno',
  'AREA': 'area',
  'MODALIDAD': 'modalidad',
  'TALLA ZAPATO': 'talla_zapato', 'TALLA DE ZAPATO': 'talla_zapato',
  'TALLA POLO': 'talla_polo', 'TALLA DE POLO': 'talla_polo',
  'TALLA PANTALON': 'talla_pantalon', 'TALLA DE PANTALON': 'talla_pantalon',
  'FECHA INGRESO': 'fecha_ingreso', 'FECHA DE INGRESO': 'fecha_ingreso',
};

const TURNOS_VALIDOS = new Set(['Mañana', 'Tarde', 'Noche']);
const AREAS_VALIDAS = new Set(['Barrido', 'Lavado', 'Conductor', 'Operaciones']);
const MODALIDAD_VALIDAS = new Set(['planilla', 'rh']);

function parsearFechaExcel(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m2) return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

async function importarExcelActivo(root, puedeEditar) {
  if (!puedeEditar) return;
  const fileInput = root.querySelector('#pa-import-file');
  const file = fileInput?.files?.[0];
  if (!file) {
    notifyError('SELECCIONE UN ARCHIVO EXCEL.');
    return;
  }

  let wb;
  try {
    const data = await file.arrayBuffer();
    wb = XLSX.read(data, { type: 'array' });
  } catch (_) {
    notifyError('NO SE PUDO LEER EL ARCHIVO. ASEGÚRESE DE QUE SEA UN EXCEL VÁLIDO (.xlsx).');
    return;
  }

  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) { notifyError('EL ARCHIVO NO TIENE HOJAS.'); return; }

  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!raw.length) { notifyError('EL ARCHIVO ESTÁ VACÍO.'); return; }

  const headerRow = raw[0].map(normalizarHeader);
  const cols = headerRow.map((h) => COL_MAP[h] || null);

  const requeridosImport = ['nombres', 'dni', 'celular', 'turno', 'area', 'modalidad', 'fecha_ingreso'];
  if (!requeridosImport.every((k) => cols.includes(k))) {
    notifyError('EL ARCHIVO DEBE TENER LAS COLUMNAS: NOMBRES, DNI, CELULAR, TURNO, ÁREA, MODALIDAD, FECHA INGRESO.');
    return;
  }

  const filas = [];
  const errores = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    const obj = {};
    let vacio = true;
    for (let c = 0; c < cols.length; c++) {
      if (!cols[c]) continue;
      let val = row[c];
      if (val !== '' && val != null) vacio = false;
      if (cols[c] === 'fecha_ingreso') val = parsearFechaExcel(row[c]);
      if (cols[c] === 'turno') val = String(val || '').trim();
      if (cols[c] === 'area') val = String(val || '').trim();
      if (cols[c] === 'dni') val = String(val || '').trim();
      obj[cols[c]] = val;
    }
    if (vacio) continue;

    const errs = [];
    if (!obj.nombres) errs.push('NOMBRES');
    if (!obj.dni) errs.push('DNI');
    if (!obj.celular) errs.push('CELULAR');
    if (!obj.turno || !TURNOS_VALIDOS.has(obj.turno)) errs.push('TURNO (Mañana/Tarde/Noche)');
    if (!obj.area || !AREAS_VALIDAS.has(obj.area)) errs.push('AREA (Barrido/Lavado/Conductor/Operaciones)');
    if (!obj.modalidad || !MODALIDAD_VALIDAS.has(obj.modalidad)) errs.push('MODALIDAD (planilla/rh)');
    if (!obj.fecha_ingreso) errs.push('FECHA INGRESO');

    if (errs.length) {
      errores.push(`FILA ${i + 1}: FALTAN O SON INVÁLIDOS → ${errs.join(', ')}`);
      continue;
    }

    filas.push({
      nombres: obj.nombres,
      dni: obj.dni,
      celular: obj.celular,
      turno: obj.turno,
      area: obj.area,
      modalidad: obj.modalidad,
      talla_zapato: obj.talla_zapato || '',
      talla_polo: obj.talla_polo || '',
      talla_pantalon: obj.talla_pantalon || '',
      fecha_ingreso: obj.fecha_ingreso,
    });
  }

  if (!filas.length) {
    const msg = errores.length ? errores.join('\n') : 'NO SE ENCONTRARON FILAS VÁLIDAS PARA IMPORTAR.';
    notifyError(msg);
    return;
  }

  let insertados = 0;
  const fallos = [];
  for (const f of filas) {
    const { error } = await supabase.from('personal_activo').insert(f);
    if (error) {
      fallos.push(`${f.nombres} (${f.dni}): ${error.message || error.code || 'ERROR'}`);
    } else {
      insertados++;
    }
  }

  fileInput.value = '';

  let resultado = `${insertados} REGISTRO(S) IMPORTADO(S) CORRECTAMENTE.`;
  if (fallos.length) resultado += `\n${fallos.length} FALLO(S):\n${fallos.join('\n')}`;
  if (errores.length) resultado += `\n${errores.length} FILA(S) OMITIDA(S) POR VALIDACIÓN:\n${errores.join('\n')}`;

  notifyOk(resultado);
  await cargarActivo(root, puedeEditar);
}

/**
 * Monta UI de personal activo.
 * @param {HTMLElement} host Contenedor
 * @param {boolean} puedeEditar CRUD
 */
export async function iniciarPanelPersonalActivo(host, puedeEditar) {
  hostActivoRef = host;
  host._puedeEditarActivo = puedeEditar;
  host.innerHTML = `
    <div class="submodule-panel">
      <dialog id="pa-dlg-cese" class="modal">
        <form id="pa-form-cese" class="form-grid">
          <h3 class="sub-title">CESAR PERSONAL</h3>
          <label>NOMBRE<input id="ce-nombre" class="input-upper" readonly /></label>
          <label>DNI<input id="ce-dni" class="input-upper" readonly /></label>
          <label>FECHA DE CESE<input id="ce-fecha" type="date" class="input-upper" required /></label>
          <label>MOTIVO DE CESE<textarea id="ce-motivo" class="input-upper" rows="3" required></textarea></label>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" id="ce-cancel">CANCELAR</button>
            <button type="button" class="btn btn-danger" id="ce-ok">CONFIRMAR CESAR</button>
          </div>
        </form>
      </dialog>
      <div class="toolbar">
        ${puedeEditar ? `<button type="button" class="btn btn-primary" id="pa-btn-nuevo">NUEVO PERSONAL</button>` : ''}
        ${puedeEditar ? `<button type="button" class="btn btn-accent" id="pa-btn-import">IMPORTAR EXCEL</button>` : ''}
        <input type="file" id="pa-import-file" accept=".xlsx,.xls" hidden />
        <button type="button" class="btn btn-secondary" id="pa-excel">DESCARGAR EXCEL</button>
      </div>
      ${
        puedeEditar
          ? `
      <form id="pa-form" class="form-grid card op-form-card" hidden>
        <label>NOMBRES COMPLETOS<input id="pa-nombres" class="input-upper" required /></label>
        <label>DNI<input id="pa-dni" class="input-upper" required /></label>
        <label>CELULAR<input id="pa-cel" class="input-upper" required /></label>
        <label>TURNO
          <select id="pa-turno" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="Mañana">MAÑANA</option>
            <option value="Tarde">TARDE</option>
            <option value="Noche">NOCHE</option>
          </select>
        </label>
        <label>ÁREA
          <select id="pa-area" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="Barrido">BARRIDO</option>
            <option value="Lavado">LAVADO</option>
            <option value="Conductor">CONDUCTOR</option>
            <option value="Operaciones">OPERACIONES</option>
          </select>
        </label>
        <label>MODALIDAD
          <select id="pa-modalidad" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="planilla">PLANILLA</option>
            <option value="rh">RH</option>
          </select>
        </label>
        <label>TALLA DE ZAPATO<input id="pa-zap" class="input-upper" /></label>
        <label>TALLA DE POLO<input id="pa-polo" class="input-upper" /></label>
        <label>TALLA DE PANTALÓN<input id="pa-pant" class="input-upper" /></label>
        <label>FECHA DE INGRESO<input id="pa-fecha" type="date" class="input-upper" required /></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">GUARDAR PERSONAL</button>
        </div>
      </form>`
          : ''
      }
      <div class="filters-bar card">
        <label>FILTRAR POR ÁREA
          <select id="pa-f-area" class="input-upper">
            <option value="">TODAS</option>
            <option value="Barrido">BARRIDO</option>
            <option value="Lavado">LAVADO</option>
            <option value="Conductor">CONDUCTOR</option>
            <option value="Operaciones">OPERACIONES</option>
          </select>
        </label>
        <label>FILTRAR POR TURNO
          <select id="pa-f-turno" class="input-upper">
            <option value="">TODOS</option>
            <option value="Mañana">MAÑANA</option>
            <option value="Tarde">TARDE</option>
            <option value="Noche">NOCHE</option>
          </select>
        </label>
        <label>BUSCAR (NOMBRE, DNI O CELULAR)<input id="pa-buscar" class="input-upper" placeholder="TEXTO" /></label>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>NOMBRES</th><th>DNI</th><th>CELULAR</th><th>TURNO</th><th>ÁREA</th><th>MODALIDAD</th>
              <th>TALLA ZAPATO</th><th>TALLA POLO</th><th>TALLA PANTALÓN</th><th>FECHA INGRESO</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody id="pa-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const fi = host.querySelector('#pa-fecha');
  if (fi) fi.value = new Date().toISOString().slice(0, 10);
  const ceFecha = host.querySelector('#ce-fecha');
  if (ceFecha) ceFecha.value = new Date().toISOString().slice(0, 10);

  if (puedeEditar) {
    host.querySelector('#pa-btn-nuevo')?.addEventListener('click', () => toggleFormActivo(host));
    host.querySelector('#pa-form')?.addEventListener('submit', (ev) => onGuardarPersonal(ev, host, puedeEditar));
    host.querySelector('#ce-cancel')?.addEventListener('click', () => cerrarModalCese(host));
    host.querySelector('#ce-ok')?.addEventListener('click', () => confirmarCese(host, puedeEditar));
    host.querySelector('#pa-btn-import')?.addEventListener('click', () => {
      host.querySelector('#pa-import-file')?.click();
    });
    host.querySelector('#pa-import-file')?.addEventListener('change', () => {
      importarExcelActivo(host, puedeEditar);
    });
  }
  host.querySelector('#pa-excel')?.addEventListener('click', () => exportarExcelActivo(host));
  ['#pa-f-area', '#pa-f-turno', '#pa-buscar'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('input', () => renderTablaActivo(host, puedeEditar));
    host.querySelector(sel)?.addEventListener('change', () => renderTablaActivo(host, puedeEditar));
  });

  await cargarActivo(host, puedeEditar);
}
