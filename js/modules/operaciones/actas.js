/**
 * Submódulo OPERACIONES — ACTAS (registro, tabla, filtros, Storage).
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { requerido } from '../../utils/validators.js';
import { formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';
import {
  BUCKET_OPERACIONES,
  MAX_ARCHIVO_BYTES,
  escHtml,
  segmentoArchivoSeguro,
  extensionMinuscula,
} from './_shared.js';
import { comprimirArchivoParaUpload } from '../../utils/file-compress.js';

/** Extensiones permitidas para actas. */
const EXT_ACTA = new Set(['pdf', 'xlsx', 'xls', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp']);

/** Cache de filas para filtrado local. */
let cacheActas = [];

/**
 * Comprueba extensión válida para actas.
 * @param {string} ext Extensión sin punto
 * @returns {boolean} Válido
 */
function extensionValidaActa(ext) {
  return EXT_ACTA.has(String(ext || '').toLowerCase());
}

/**
 * Valida archivo de acta (tamaño y extensión).
 * @param {File|null} file Archivo
 * @returns {string|null} Error o null
 */
function validarArchivoActa(file) {
  if (!file) return 'DEBE SELECCIONAR UN ARCHIVO.';
  if (file.size > MAX_ARCHIVO_BYTES) return 'EL ARCHIVO SUPERA 10MB.';
  const ext = extensionMinuscula(file.name);
  if (!extensionValidaActa(ext)) {
    return 'FORMATO NO PERMITIDO (.PDF, .XLSX, .XLS, .DOCX, .DOC, .JPG, .JPEG, .PNG, .WEBP).';
  }
  return null;
}

/**
 * Genera URL firmada de lectura.
 * @param {string} path Ruta en bucket
 * @param {number} segundos Vigencia
 * @returns {Promise<string>} URL
 */
async function urlFirmadaLectura(path, segundos = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET_OPERACIONES).createSignedUrl(path, segundos);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('NO SE PUDO GENERAR URL.');
  return data.signedUrl;
}

/**
 * Descarga archivo desde Storage vía URL firmada y blob local.
 * @param {string} path Ruta
 * @param {string} nombreDescarga Nombre sugerido
 */
async function descargarDesdeStorage(path, nombreDescarga) {
  const url = await urlFirmadaLectura(path, 7200);
  const res = await fetch(url);
  if (!res.ok) throw new Error('ERROR AL DESCARGAR.');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombreDescarga || 'archivo';
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Abre el archivo en una nueva pestaña del navegador.
 * @param {string} path Ruta Storage
 */
async function verArchivoActa(path) {
  const url = await urlFirmadaLectura(path, 3600);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Inserta acta y sube archivo (optimizado en cliente cuando aplica).
 * @param {object} payload Datos + file
 * @returns {Promise<{ optimizado: boolean, detalle: string }>}
 */
async function registrarActa(payload) {
  const { nombre, tipo, fecha, responsable, file } = payload;
  const err = validarArchivoActa(file);
  if (err) throw new Error(err);

  const { file: fileSubida, optimizado, detalle } = await comprimirArchivoParaUpload(file);
  if (fileSubida.size > MAX_ARCHIVO_BYTES) {
    throw new Error('EL ARCHIVO SUPERA 10MB TRAS OPTIMIZAR.');
  }

  const id = crypto.randomUUID();
  const seg = segmentoArchivoSeguro(fileSubida.name);
  const storagePath = `actas/${id}/${seg}`;

  const { error: upErr } = await supabase.storage.from(BUCKET_OPERACIONES).upload(storagePath, fileSubida, {
    cacheControl: '3600',
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from('operaciones_actas').insert({
    id,
    nombre: nombre.trim(),
    tipo,
    fecha,
    responsable: responsable.trim(),
    archivo_path: storagePath,
    archivo_nombre: fileSubida.name,
  });
  if (insErr) {
    await supabase.storage.from(BUCKET_OPERACIONES).remove([storagePath]);
    throw insErr;
  }
  return { optimizado, detalle };
}

/**
 * Filtra actas por tipo, texto (nombre o responsable), responsable exacto y fechas.
 * @param {Array<object>} rows Filas
 * @param {string} tipo Tipo o vacío
 * @param {string} q Texto libre
 * @param {string} resp Responsable exacto o vacío
 * @param {string} desde Fecha desde
 * @param {string} hasta Fecha hasta
 * @returns {Array<object>} Resultado
 */
function filtrarActas(rows, tipo, q, resp, desde, hasta) {
  const qt = (q || '').trim().toUpperCase();
  const rt = (resp || '').trim().toUpperCase();
  return rows.filter((r) => {
    if (tipo && r.tipo !== tipo) return false;
    if (rt && String(r.responsable || '').trim().toUpperCase() !== rt) return false;
    if (qt) {
      const n = String(r.nombre || '').toUpperCase();
      const res = String(r.responsable || '').toUpperCase();
      if (!n.includes(qt) && !res.includes(qt)) return false;
    }
    if (desde && String(r.fecha) < desde) return false;
    if (hasta && String(r.fecha) > hasta) return false;
    return true;
  });
}

/**
 * Obtiene lista única de responsables ordenada.
 * @param {Array<object>} rows Filas
 * @returns {string[]} Responsables
 */
function responsablesUnicos(rows) {
  const s = new Set();
  for (const r of rows) {
    if (r.responsable && String(r.responsable).trim()) s.add(String(r.responsable).trim());
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Renderiza tabla de actas con listeners.
 * @param {HTMLElement} root Raíz
 */
function renderTablaActas(root) {
  const tbody = root.querySelector('#oa-tbody');
  if (!tbody) return;
  const tipo = root.querySelector('#oa-f-tipo')?.value || '';
  const q = root.querySelector('#oa-buscar')?.value || '';
  const resp = root.querySelector('#oa-f-resp')?.value || '';
  const desde = root.querySelector('#oa-f-desde')?.value || '';
  const hasta = root.querySelector('#oa-f-hasta')?.value || '';
  const rows = filtrarActas(cacheActas, tipo, q, resp, desde, hasta);
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(r.nombre)}</td>
      <td>${escHtml(r.tipo)}</td>
      <td>${escHtml(formatearFecha(r.fecha))}</td>
      <td>${escHtml(r.responsable)}</td>
      <td>${escHtml(r.archivo_nombre)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm" data-oa-ver="${r.id}">VER</button>
        <button type="button" class="btn btn-sm btn-secondary" data-oa-down="${r.id}">DESCARGAR</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-oa-ver]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = cacheActas.find((x) => x.id === b.getAttribute('data-oa-ver'));
      if (!row) return;
      try {
        await verArchivoActa(row.archivo_path);
      } catch (e) {
        console.error(e);
        notifyError(e.message || 'NO SE PUDO ABRIR.');
      }
    }),
  );
  tbody.querySelectorAll('[data-oa-down]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = cacheActas.find((x) => x.id === b.getAttribute('data-oa-down'));
      if (!row) return;
      try {
        await descargarDesdeStorage(row.archivo_path, row.archivo_nombre);
        notifyOk('DESCARGA INICIADA.');
      } catch (e) {
        console.error(e);
        notifyError(e.message || 'ERROR AL DESCARGAR.');
      }
    }),
  );
}

/**
 * Actualiza opciones del select de responsables según cache global.
 * @param {HTMLElement} root Raíz
 */
function refrescarSelectResponsables(root) {
  const sel = root.querySelector('#oa-f-resp');
  if (!sel) return;
  const val = sel.value;
  const lista = responsablesUnicos(cacheActas);
  sel.innerHTML = '<option value="">TODOS</option>';
  for (const nombre of lista) {
    const o = document.createElement('option');
    o.value = nombre;
    o.textContent = nombre.toUpperCase();
    sel.appendChild(o);
  }
  if (lista.includes(val)) sel.value = val;
}

/**
 * Carga actas desde Supabase.
 * @param {HTMLElement} root Raíz
 */
async function cargarActas(root) {
  const { data, error } = await supabase.from('operaciones_actas').select('*').order('fecha', { ascending: false });
  if (error) {
    notifyError(error.message);
    cacheActas = [];
    refrescarSelectResponsables(root);
    renderTablaActas(root);
    return;
  }
  cacheActas = data || [];
  refrescarSelectResponsables(root);
  renderTablaActas(root);
}

/**
 * Exporta metadatos filtrados a Excel.
 * @param {HTMLElement} root Raíz
 */
function exportarExcelActas(root) {
  const tipo = root.querySelector('#oa-f-tipo')?.value || '';
  const q = root.querySelector('#oa-buscar')?.value || '';
  const resp = root.querySelector('#oa-f-resp')?.value || '';
  const desde = root.querySelector('#oa-f-desde')?.value || '';
  const hasta = root.querySelector('#oa-f-hasta')?.value || '';
  const rows = filtrarActas(cacheActas, tipo, q, resp, desde, hasta);
  const filas = rows.map((r) => ({
    NOMBRE: r.nombre,
    TIPO: r.tipo,
    FECHA: formatearFecha(r.fecha),
    RESPONSABLE: r.responsable,
    ARCHIVO: r.archivo_nombre,
  }));
  exportarExcel('actas_operaciones', 'ACTAS', filas);
  notifyOk('EXCEL GENERADO (SOLO METADATOS).');
}

/**
 * Muestra u oculta formulario de nueva acta.
 * @param {HTMLElement} root Raíz
 */
function toggleFormActas(root) {
  const form = root.querySelector('#oa-form');
  if (!form) return;
  form.hidden = !form.hidden;
}

/**
 * Envío del formulario de actas.
 * @param {Event} ev Evento submit
 * @param {HTMLElement} root Raíz
 * @param {boolean} puedeEditar Si puede persistir
 */
async function onSubmitActa(ev, root, puedeEditar) {
  ev.preventDefault();
  if (!puedeEditar) return;
  const nombre = root.querySelector('#oa-nombre')?.value || '';
  const tipo = root.querySelector('#oa-tipo')?.value || '';
  const fecha = root.querySelector('#oa-fecha')?.value || '';
  const responsable = root.querySelector('#oa-resp')?.value || '';
  const file = root.querySelector('#oa-file')?.files?.[0] || null;
  if (!requerido(nombre) || !requerido(tipo) || !requerido(fecha) || !requerido(responsable)) {
    notifyError('COMPLETE LOS CAMPOS OBLIGATORIOS.');
    return;
  }
  const v = validarArchivoActa(file);
  if (v) {
    notifyError(v);
    return;
  }
  try {
    const { optimizado, detalle } = await registrarActa({ nombre, tipo, fecha, responsable, file });
    notifyOk(optimizado && detalle ? `ACTA SUBIDA. ${detalle}` : 'ACTA SUBIDA.');
    root.querySelector('#oa-form')?.reset();
    const fi = root.querySelector('#oa-fecha');
    if (fi) fi.value = new Date().toISOString().slice(0, 10);
    await cargarActas(root);
  } catch (e) {
    console.error(e);
    notifyError(e.message || 'ERROR AL SUBIR.');
  }
}

/**
 * Monta UI y eventos del submódulo ACTAS.
 * @param {HTMLElement} host Contenedor
 * @param {boolean} puedeEditar CRUD
 */
export async function iniciarPanelActas(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      <div class="toolbar">
        ${puedeEditar ? `<button type="button" class="btn btn-primary" id="oa-btn-nuevo">NUEVA ACTA</button>` : ''}
        <button type="button" class="btn btn-secondary" id="oa-btn-excel">DESCARGAR EXCEL</button>
      </div>
      ${
        puedeEditar
          ? `
      <form id="oa-form" class="form-grid card op-form-card" hidden>
        <label>NOMBRE DEL ACTA<input id="oa-nombre" class="input-upper" required /></label>
        <label>TIPO
          <select id="oa-tipo" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="PDF">PDF</option>
            <option value="EXCEL">EXCEL</option>
            <option value="WORD">WORD</option>
            <option value="IMAGEN">IMAGEN</option>
            <option value="OTRO">OTRO</option>
          </select>
        </label>
        <label>FECHA<input id="oa-fecha" type="date" class="input-upper" required /></label>
        <label>RESPONSABLE<input id="oa-resp" class="input-upper" required /></label>
        <label>ARCHIVO (PC O MÓVIL)
          <input id="oa-file" type="file" class="input-upper" accept=".pdf,.xlsx,.xls,.docx,.doc,.jpg,.jpeg,.png,.webp,image/*" required />
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">SUBIR ACTA</button>
        </div>
      </form>`
          : ''
      }
      <div class="filters-bar card">
        <label>FILTRAR POR TIPO
          <select id="oa-f-tipo" class="input-upper">
            <option value="">TODOS</option>
            <option value="PDF">PDF</option>
            <option value="EXCEL">EXCEL</option>
            <option value="WORD">WORD</option>
            <option value="IMAGEN">IMAGEN</option>
            <option value="OTRO">OTRO</option>
          </select>
        </label>
        <label>BUSCAR (NOMBRE O RESPONSABLE)<input id="oa-buscar" class="input-upper" placeholder="TEXTO" /></label>
        <label>FILTRAR POR RESPONSABLE
          <select id="oa-f-resp" class="input-upper"><option value="">TODOS</option></select>
        </label>
        <label>FECHA DESDE<input id="oa-f-desde" type="date" class="input-upper" /></label>
        <label>FECHA HASTA<input id="oa-f-hasta" type="date" class="input-upper" /></label>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead><tr><th>NOMBRE</th><th>TIPO</th><th>FECHA</th><th>RESPONSABLE</th><th>ARCHIVO</th><th>ACCIONES</th></tr></thead>
          <tbody id="oa-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const f = host.querySelector('#oa-fecha');
  if (f) f.value = new Date().toISOString().slice(0, 10);

  if (puedeEditar) {
    host.querySelector('#oa-btn-nuevo')?.addEventListener('click', () => toggleFormActas(host));
    host.querySelector('#oa-form')?.addEventListener('submit', (ev) => onSubmitActa(ev, host, puedeEditar));
  }
  host.querySelector('#oa-btn-excel')?.addEventListener('click', () => exportarExcelActas(host));
  ['#oa-f-tipo', '#oa-buscar', '#oa-f-resp', '#oa-f-desde', '#oa-f-hasta'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('input', () => renderTablaActas(host));
    host.querySelector(sel)?.addEventListener('change', () => renderTablaActas(host));
  });

  await cargarActas(host);
}
