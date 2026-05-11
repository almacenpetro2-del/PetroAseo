/**
 * Submódulo OPERACIONES — DOCUMENTOS (registro, tabla, filtros, Storage).
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

/** Extensiones permitidas para documentos (metadato + validación). */
const EXT_DOCUMENTO = new Set(['pdf', 'xlsx', 'xls', 'docx', 'doc']);

/** Copia en memoria de filas para filtrar en cliente. */
let cacheDocumentos = [];

/**
 * Indica si la extensión es aceptada para el submódulo documentos.
 * @param {string} ext Extensión sin punto
 * @returns {boolean} Válido o no
 */
function extensionValidaDocumento(ext) {
  return EXT_DOCUMENTO.has(String(ext || '').toLowerCase());
}

/**
 * Valida tamaño y extensión del archivo seleccionado.
 * @param {File|null} file Archivo del input
 * @returns {string|null} Mensaje de error o null si OK
 */
function validarArchivoDocumento(file) {
  if (!file) return 'DEBE SELECCIONAR UN ARCHIVO.';
  if (file.size > MAX_ARCHIVO_BYTES) return 'EL ARCHIVO SUPERA 10MB.';
  const ext = extensionMinuscula(file.name);
  if (!extensionValidaDocumento(ext)) return 'FORMATO NO PERMITIDO (.PDF, .XLSX, .XLS, .DOCX, .DOC).';
  return null;
}

/**
 * Solicita URL firmada de lectura para un objeto en Storage.
 * @param {string} path Ruta dentro del bucket
 * @param {number} segundos Vigencia
 * @returns {Promise<string>} URL firmada
 */
async function urlFirmadaLectura(path, segundos = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET_OPERACIONES).createSignedUrl(path, segundos);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('NO SE PUDO GENERAR URL.');
  return data.signedUrl;
}

/**
 * Descarga un archivo del bucket al dispositivo del usuario.
 * @param {string} path Ruta en Storage
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
 * Abre previsualización o nueva pestaña según tipo lógico del archivo.
 * @param {string} path Ruta Storage
 * @param {string} nombreArchivo Nombre original
 */
async function verArchivoDocumento(path, _nombreArchivo) {
  const url = await urlFirmadaLectura(path, 3600);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Elimina fila y objeto en Storage.
 * @param {string} id UUID registro
 * @param {string} path Ruta Storage
 */
async function eliminarDocumentoCompleto(id, path) {
  const { error: e1 } = await supabase.storage.from(BUCKET_OPERACIONES).remove([path]);
  if (e1) console.warn(e1);
  const { error: e2 } = await supabase.from('operaciones_documentos').delete().eq('id', id);
  if (e2) throw e2;
}

/**
 * Inserta metadatos y sube archivo a Storage en la ruta documentos/{id}/...
 * @param {object} payload Campos del formulario + file
 * @returns {Promise<{ optimizado: boolean, detalle: string }>}
 */
async function registrarDocumento(payload) {
  const { nombre, tipo_documento, fecha, file } = payload;
  const err = validarArchivoDocumento(file);
  if (err) throw new Error(err);

  if (file.size > MAX_ARCHIVO_BYTES) {
    throw new Error('EL ARCHIVO SUPERA 10MB.');
  }

  const id = crypto.randomUUID();
  const seg = segmentoArchivoSeguro(file.name);
  const storagePath = `documentos/${id}/${seg}`;

  const { error: upErr } = await supabase.storage.from(BUCKET_OPERACIONES).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error: insErr } = await supabase.from('operaciones_documentos').insert({
    id,
    nombre: nombre.trim(),
    tipo_documento,
    fecha,
    archivo_path: storagePath,
    archivo_nombre: file.name,
  });
  if (insErr) {
    await supabase.storage.from(BUCKET_OPERACIONES).remove([storagePath]);
    throw insErr;
  }
  return { optimizado: false, detalle: 'ARCHIVO SUBIDO EN FORMATO ORIGINAL.' };
}

/**
 * Aplica filtros de tipo, texto y rango de fechas sobre filas.
 * @param {Array<object>} rows Filas crudas
 * @param {string} tipo Filtro tipo o vacío
 * @param {string} q Búsqueda nombre
 * @param {string} desde Fecha yyyy-mm-dd o vacío
 * @param {string} hasta Fecha yyyy-mm-dd o vacío
 * @returns {Array<object>} Filtradas
 */
function filtrarDocumentos(rows, tipo, q, desde, hasta) {
  const qt = (q || '').trim().toUpperCase();
  return rows.filter((r) => {
    if (tipo && r.tipo_documento !== tipo) return false;
    if (qt && !String(r.nombre || '').toUpperCase().includes(qt)) return false;
    if (desde && String(r.fecha) < desde) return false;
    if (hasta && String(r.fecha) > hasta) return false;
    return true;
  });
}

/**
 * Pinta la tabla según estado en memoria y filtros actuales del DOM.
 * @param {HTMLElement} root Contenedor del submódulo
 * @param {boolean} puedeEditar Si muestra eliminar y formulario
 */
function renderTablaDocumentos(root, puedeEditar) {
  const tbody = root.querySelector('#od-tbody');
  if (!tbody) return;
  const tipo = root.querySelector('#od-f-tipo')?.value || '';
  const q = root.querySelector('#od-buscar')?.value || '';
  const desde = root.querySelector('#od-f-desde')?.value || '';
  const hasta = root.querySelector('#od-f-hasta')?.value || '';
  const rows = filtrarDocumentos(cacheDocumentos, tipo, q, desde, hasta);
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escHtml(r.nombre)}</td>
      <td>${escHtml(r.tipo_documento)}</td>
      <td>${escHtml(formatearFecha(r.fecha))}</td>
      <td>${escHtml(r.archivo_nombre)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm" data-od-ver="${r.id}">VER</button>
        <button type="button" class="btn btn-sm btn-secondary" data-od-down="${r.id}">DESCARGAR</button>
        ${
          puedeEditar
            ? `<button type="button" class="btn btn-sm btn-danger" data-od-del="${r.id}">ELIMINAR</button>`
            : ''
        }
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-od-ver]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = cacheDocumentos.find((x) => x.id === b.getAttribute('data-od-ver'));
      if (!row) return;
      try {
        await verArchivoDocumento(row.archivo_path, row.archivo_nombre);
      } catch (e) {
        console.error(e);
        notifyError(e.message || 'NO SE PUDO ABRIR.');
      }
    }),
  );
  tbody.querySelectorAll('[data-od-down]').forEach((b) =>
    b.addEventListener('click', async () => {
      const row = cacheDocumentos.find((x) => x.id === b.getAttribute('data-od-down'));
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
  if (puedeEditar) {
    tbody.querySelectorAll('[data-od-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const id = b.getAttribute('data-od-del');
        const row = cacheDocumentos.find((x) => x.id === id);
        if (!row) return;
        if (!window.confirm('¿ELIMINAR DOCUMENTO Y ARCHIVO?')) return;
        try {
          await eliminarDocumentoCompleto(row.id, row.archivo_path);
          notifyOk('DOCUMENTO ELIMINADO.');
          await cargarDocumentos(root, puedeEditar);
        } catch (e) {
          console.error(e);
          notifyError(e.message || 'ERROR AL ELIMINAR.');
        }
      }),
    );
  }
}

/**
 * Carga documentos desde Supabase y refresca tabla.
 * @param {HTMLElement} root Raíz del panel
 * @param {boolean} puedeEditar Permisos UI
 */
async function cargarDocumentos(root, puedeEditar) {
  const { data, error } = await supabase.from('operaciones_documentos').select('*').order('fecha', { ascending: false });
  if (error) {
    notifyError(error.message);
    cacheDocumentos = [];
    renderTablaDocumentos(root, puedeEditar);
    return;
  }
  cacheDocumentos = data || [];
  renderTablaDocumentos(root, puedeEditar);
}

/**
 * Exporta metadatos visibles (filtrados) a Excel.
 * @param {HTMLElement} root Raíz del panel
 */
function exportarExcelDocumentos(root) {
  const tipo = root.querySelector('#od-f-tipo')?.value || '';
  const q = root.querySelector('#od-buscar')?.value || '';
  const desde = root.querySelector('#od-f-desde')?.value || '';
  const hasta = root.querySelector('#od-f-hasta')?.value || '';
  const rows = filtrarDocumentos(cacheDocumentos, tipo, q, desde, hasta);
  const filas = rows.map((r) => ({
    NOMBRE: r.nombre,
    TIPO: r.tipo_documento,
    FECHA: formatearFecha(r.fecha),
    ARCHIVO: r.archivo_nombre,
  }));
  exportarExcel('documentos_operaciones', 'DOCUMENTOS', filas);
  notifyOk('EXCEL GENERADO (SOLO METADATOS).');
}

/**
 * Muestra u oculta el formulario de registro de documentos.
 * @param {HTMLElement} root Raíz del panel
 */
function toggleFormDocumentos(root) {
  const form = root.querySelector('#od-form');
  if (!form) return;
  form.hidden = !form.hidden;
}

/**
 * Maneja envío del formulario de nuevo documento.
 * @param {Event} ev Submit
 * @param {HTMLElement} root Raíz
 * @param {boolean} puedeEditar Si puede guardar
 */
async function onSubmitDocumento(ev, root, puedeEditar) {
  ev.preventDefault();
  if (!puedeEditar) return;
  const nombre = root.querySelector('#od-nombre')?.value || '';
  const tipo_documento = root.querySelector('#od-tipo')?.value || '';
  const fecha = root.querySelector('#od-fecha')?.value || '';
  const fileInput = root.querySelector('#od-file');
  const file = fileInput?.files?.[0] || null;
  if (!requerido(nombre) || !requerido(tipo_documento) || !requerido(fecha)) {
    notifyError('COMPLETE LOS CAMPOS OBLIGATORIOS.');
    return;
  }
  const v = validarArchivoDocumento(file);
  if (v) {
    notifyError(v);
    return;
  }
  try {
    const { optimizado, detalle } = await registrarDocumento({ nombre, tipo_documento, fecha, file });
    notifyOk(optimizado && detalle ? `DOCUMENTO SUBIDO. ${detalle}` : 'DOCUMENTO SUBIDO.');
    root.querySelector('#od-form')?.reset();
    const hoy = new Date().toISOString().slice(0, 10);
    const fi = root.querySelector('#od-fecha');
    if (fi) fi.value = hoy;
    await cargarDocumentos(root, puedeEditar);
  } catch (e) {
    console.error(e);
    notifyError(e.message || 'ERROR AL SUBIR.');
  }
}

/**
 * Inicializa el panel DOCUMENTOS (HTML, eventos, primera carga).
 * @param {HTMLElement} host Elemento donde se monta el panel
 * @param {boolean} puedeEditar CRUD según rol
 */
export async function iniciarPanelDocumentos(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      <div class="toolbar">
        ${puedeEditar ? `<button type="button" class="btn btn-primary" id="od-btn-nuevo">NUEVO DOCUMENTO</button>` : ''}
        <button type="button" class="btn btn-secondary" id="od-btn-excel">DESCARGAR EXCEL</button>
      </div>
      ${
        puedeEditar
          ? `
      <form id="od-form" class="form-grid card op-form-card" hidden>
        <label>NOMBRE DEL DOCUMENTO<input id="od-nombre" class="input-upper" required /></label>
        <label>TIPO DE DOCUMENTO
          <select id="od-tipo" class="input-upper" required>
            <option value="">— SELECCIONE —</option>
            <option value="PDF">PDF</option>
            <option value="EXCEL">EXCEL</option>
            <option value="WORD">WORD</option>
          </select>
        </label>
        <label>FECHA<input id="od-fecha" type="date" class="input-upper" required /></label>
        <label>ARCHIVO (PC O MÓVIL)
          <input id="od-file" type="file" class="input-upper" accept=".pdf,.xlsx,.xls,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
        </label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">SUBIR DOCUMENTO</button>
        </div>
      </form>`
          : ''
      }
      <div class="filters-bar card">
        <label>FILTRAR POR TIPO
          <select id="od-f-tipo" class="input-upper">
            <option value="">TODOS</option>
            <option value="PDF">PDF</option>
            <option value="EXCEL">EXCEL</option>
            <option value="WORD">WORD</option>
          </select>
        </label>
        <label>BUSCAR POR NOMBRE<input id="od-buscar" class="input-upper" placeholder="NOMBRE" /></label>
        <label>FECHA DESDE<input id="od-f-desde" type="date" class="input-upper" /></label>
        <label>FECHA HASTA<input id="od-f-hasta" type="date" class="input-upper" /></label>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead><tr><th>NOMBRE</th><th>TIPO</th><th>FECHA</th><th>ARCHIVO</th><th>ACCIONES</th></tr></thead>
          <tbody id="od-tbody"></tbody>
        </table>
      </div>
    </div>`;

  const fechaInp = host.querySelector('#od-fecha');
  if (fechaInp) fechaInp.value = new Date().toISOString().slice(0, 10);

  if (puedeEditar) {
    host.querySelector('#od-btn-nuevo')?.addEventListener('click', () => toggleFormDocumentos(host));
    host.querySelector('#od-form')?.addEventListener('submit', (ev) => onSubmitDocumento(ev, host, puedeEditar));
  }
  host.querySelector('#od-btn-excel')?.addEventListener('click', () => exportarExcelDocumentos(host));
  ['#od-f-tipo', '#od-buscar', '#od-f-desde', '#od-f-hasta'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('input', () => renderTablaDocumentos(host, puedeEditar));
    host.querySelector(sel)?.addEventListener('change', () => renderTablaDocumentos(host, puedeEditar));
  });

  await cargarDocumentos(host, puedeEditar);
}
