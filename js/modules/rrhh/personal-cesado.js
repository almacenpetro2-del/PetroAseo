/**
 * Submódulo RRHH — PERSONAL CESADO (solo consulta, modal detalle).
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';

/** Cache de filas cesadas. */
let cacheCesado = [];

/** Último contenedor montado (para refresco tras cese sin duplicar listeners). */
let hostCesadoRef = null;

/**
 * Refresca la tabla si el panel estuvo montado al menos una vez.
 */
function onActualizadoCesadoExterno() {
  if (hostCesadoRef) cargarCesado(hostCesadoRef);
}

window.addEventListener('petroaseo:personal-cesado-actualizado', onActualizadoCesadoExterno);

/**
 * Escapa HTML.
 * @param {string|number|null|undefined} t Texto
 * @returns {string} Escapado
 */
function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Filtra personal cesado.
 * @param {Array<object>} rows Filas
 * @param {string} q Nombre o DNI
 * @param {string} area Área o vacío
 * @param {string} desde Fecha cese desde
 * @param {string} hasta Fecha cese hasta
 * @returns {Array<object>} Filtradas
 */
function filtrarCesado(rows, q, area, desde, hasta) {
  const qt = (q || '').trim().toUpperCase();
  return rows.filter((r) => {
    if (area && r.area !== area) return false;
    if (qt) {
      const n = String(r.nombres || '').toUpperCase();
      const d = String(r.dni || '').toUpperCase();
      const c = String(r.celular || '').toUpperCase();
      if (!n.includes(qt) && !d.includes(qt) && !c.includes(qt)) return false;
    }
    if (desde && String(r.fecha_cese) < desde) return false;
    if (hasta && String(r.fecha_cese) > hasta) return false;
    return true;
  });
}

/**
 * Renderiza tabla de cesados.
 * @param {HTMLElement} root Raíz
 */
function renderTablaCesado(root) {
  const tbody = root.querySelector('#pc-tbody');
  if (!tbody) return;
  const q = root.querySelector('#pc-buscar')?.value || '';
  const area = root.querySelector('#pc-f-area')?.value || '';
  const desde = root.querySelector('#pc-f-desde')?.value || '';
  const hasta = root.querySelector('#pc-f-hasta')?.value || '';
  const rows = filtrarCesado(cacheCesado, q, area, desde, hasta);
  const puedeEditar = root._puedeEditarCesado || false;
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.nombres)}</td>
      <td>${esc(r.dni)}</td>
      <td>${esc(r.celular)}</td>
      <td>${esc(r.turno)}</td>
      <td>${esc(r.area)}</td>
      <td>${esc(formatearFecha(r.fecha_ingreso))}</td>
      <td>${esc(formatearFecha(r.fecha_cese))}</td>
      <td>${esc(r.motivo)}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm" data-pc-ver="${r.id}">VER</button>
        ${puedeEditar ? `<button type="button" class="btn btn-sm btn-secondary" data-pc-incorporar="${r.id}">INCORPORAR</button>` : ''}
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('[data-pc-ver]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-pc-ver');
      const row = cacheCesado.find((x) => x.id === id);
      if (row) abrirModalVer(root, row);
    }),
  );
  if (puedeEditar) {
    tbody.querySelectorAll('[data-pc-incorporar]').forEach((b) =>
      b.addEventListener('click', () => incorporarPersonal(root, b.getAttribute('data-pc-incorporar'))),
    );
  }
}

/**
 * Abre modal de solo lectura con todos los campos.
 * @param {HTMLElement} root Raíz
 * @param {object} row Registro
 */
function abrirModalVer(root, row) {
  const dlg = root.querySelector('#pc-dlg-ver');
  if (!dlg) return;
  const set = (id, val) => {
    const el = root.querySelector(id);
    if (el) el.textContent = val ?? '';
  };
  set('#pv-nombres', row.nombres);
  set('#pv-dni', row.dni);
  set('#pv-cel', row.celular);
  set('#pv-turno', row.turno);
  set('#pv-area', row.area);
  set('#pv-zap', row.talla_zapato);
  set('#pv-polo', row.talla_polo);
  set('#pv-pant', row.talla_pantalon);
  set('#pv-fi', formatearFecha(row.fecha_ingreso));
  set('#pv-fc', formatearFecha(row.fecha_cese));
  set('#pv-motivo', row.motivo);
  /** @type {HTMLDialogElement} */ (dlg).showModal();
}

/**
 * Cierra modal de detalle.
 * @param {HTMLElement} root Raíz
 */
function cerrarModalVer(root) {
  const dlg = root.querySelector('#pc-dlg-ver');
  if (dlg) /** @type {HTMLDialogElement} */ (dlg).close();
}

/**
 * Carga datos desde Supabase.
 * @param {HTMLElement} root Raíz
 */
async function cargarCesado(root) {
  const { data, error } = await supabase.from('personal_cesado').select('*').order('fecha_cese', { ascending: false });
  if (error) {
    notifyError(error.message);
    cacheCesado = [];
    renderTablaCesado(root);
    return;
  }
  cacheCesado = data || [];
  renderTablaCesado(root);
}

/**
 * Exporta metadatos filtrados a Excel.
 * @param {HTMLElement} root Raíz
 */
function exportarExcelCesado(root) {
  const q = root.querySelector('#pc-buscar')?.value || '';
  const area = root.querySelector('#pc-f-area')?.value || '';
  const desde = root.querySelector('#pc-f-desde')?.value || '';
  const hasta = root.querySelector('#pc-f-hasta')?.value || '';
  const rows = filtrarCesado(cacheCesado, q, area, desde, hasta);
  const filas = rows.map((r) => ({
    NOMBRES: r.nombres,
    DNI: r.dni,
    CELULAR: r.celular,
    TURNO: r.turno,
    ÁREA: r.area,
    'FECHA INGRESO': formatearFecha(r.fecha_ingreso),
    'FECHA CESE': formatearFecha(r.fecha_cese),
    MOTIVO: r.motivo,
  }));
  exportarExcel('personal_cesado', 'PERSONAL_CESADO', filas);
  notifyOk('EXCEL GENERADO.');
}

/**
 * Reincorpora personal cesado a activo vía RPC atómica.
 * @param {HTMLElement} root Raíz
 * @param {string|null} id UUID personal cesado
 */
async function incorporarPersonal(root, id) {
  const row = cacheCesado.find((x) => x.id === id);
  if (!row) return;
  if (!confirm(`¿REINCORPORAR A ${row.nombres} (${row.dni}) COMO PERSONAL ACTIVO?`)) return;
  try {
    const { error } = await supabase.rpc('incorporar_personal', { p_id: id });
    if (error) throw error;
    notifyOk(`${row.nombres} REINCORPORADO.`);
    window.dispatchEvent(new CustomEvent('petroaseo:personal-activo-actualizado'));
    await cargarCesado(root);
  } catch (e) {
    console.error(e);
    notifyError(e.message || 'ERROR AL INCORPORAR.');
  }
}

/**
 * Monta submódulo personal cesado.
 * @param {HTMLElement} host Contenedor
 * @param {boolean} [puedeEditar=false]
 */
export async function iniciarPanelPersonalCesado(host, puedeEditar = false) {
  hostCesadoRef = host;
  host._puedeEditarCesado = puedeEditar;
  host.innerHTML = `
    <div class="submodule-panel">
      <dialog id="pc-dlg-ver" class="modal">
        <h3 class="sub-title">DETALLE PERSONAL CESADO</h3>
        <div class="detail-readonly form-grid">
          <div><strong>NOMBRES</strong><p id="pv-nombres"></p></div>
          <div><strong>DNI</strong><p id="pv-dni"></p></div>
          <div><strong>CELULAR</strong><p id="pv-cel"></p></div>
          <div><strong>TURNO</strong><p id="pv-turno"></p></div>
          <div><strong>ÁREA</strong><p id="pv-area"></p></div>
          <div><strong>TALLA ZAPATO</strong><p id="pv-zap"></p></div>
          <div><strong>TALLA POLO</strong><p id="pv-polo"></p></div>
          <div><strong>TALLA PANTALÓN</strong><p id="pv-pant"></p></div>
          <div><strong>FECHA INGRESO</strong><p id="pv-fi"></p></div>
          <div><strong>FECHA CESE</strong><p id="pv-fc"></p></div>
          <div style="grid-column:1/-1"><strong>MOTIVO</strong><p id="pv-motivo"></p></div>
        </div>
        <div class="form-actions" style="margin-top:0.75rem">
          <button type="button" class="btn btn-secondary" id="pv-cerrar">CERRAR</button>
        </div>
      </dialog>
      <div class="toolbar">
        <button type="button" class="btn btn-secondary" id="pc-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="filters-bar card">
        <label>BUSCAR (NOMBRE, DNI O CELULAR)<input id="pc-buscar" class="input-upper" placeholder="TEXTO" /></label>
        <label>FILTRAR POR ÁREA
          <select id="pc-f-area" class="input-upper">
            <option value="">TODAS</option>
            <option value="Barrido">BARRIDO</option>
            <option value="Lavado">LAVADO</option>
            <option value="Conductor">CONDUCTOR</option>
            <option value="Operaciones">OPERACIONES</option>
          </select>
        </label>
        <label>FECHA CESE DESDE<input id="pc-f-desde" type="date" class="input-upper" /></label>
        <label>FECHA CESE HASTA<input id="pc-f-hasta" type="date" class="input-upper" /></label>
      </div>
      <div class="card table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>NOMBRES</th><th>DNI</th><th>CELULAR</th><th>TURNO</th><th>ÁREA</th>
              <th>FECHA INGRESO</th><th>FECHA CESE</th><th>MOTIVO</th><th>ACCIONES</th>
            </tr>
          </thead>
          <tbody id="pc-tbody"></tbody>
        </table>
      </div>
    </div>`;

  host.querySelector('#pc-excel')?.addEventListener('click', () => exportarExcelCesado(host));
  host.querySelector('#pv-cerrar')?.addEventListener('click', () => cerrarModalVer(host));
  ['#pc-buscar', '#pc-f-area', '#pc-f-desde', '#pc-f-hasta'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('input', () => renderTablaCesado(host));
    host.querySelector(sel)?.addEventListener('change', () => renderTablaCesado(host));
  });

  await cargarCesado(host);
}
