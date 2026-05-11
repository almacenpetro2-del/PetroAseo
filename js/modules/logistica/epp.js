/**
 * Submódulo EPP / HERRAMIENTAS — seguimiento por trabajador y frecuencia entre entregas.
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';

/**
 * Calcula diferencia en días entre dos fechas ISO yyyy-mm-dd.
 * @param {string} prev Fecha anterior
 * @param {string} cur Fecha actual
 */
function diasEntre(prev, cur) {
  const a = new Date(prev + 'T12:00:00');
  const b = new Date(cur + 'T12:00:00');
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * Nombres del personal activo (sugerencias desde personal_activo).
 */
async function cargarNombresPersonalActivo() {
  const { data, error } = await supabase.from('personal_activo').select('nombres').order('nombres');
  if (error) throw error;
  return (data || []).map((r) => r.nombres);
}

/**
 * Productos registrados (sugerencias desde productos).
 */
async function cargarProductosNombres() {
  const { data, error } = await supabase.from('productos').select('nombre').order('nombre');
  if (error) throw error;
  return (data || []).map((r) => r.nombre);
}

/**
 * Inicializa panel EPP / herramientas.
 * @param {HTMLElement} host Panel contenedor
 * @param {boolean} puedeEditar Permisos
 */
export async function iniciarPanelEpp(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      ${puedeEditar ? `
      <form id="form-epp" class="form-grid card op-form-card">
        <label>NOMBRE DEL PERSONAL<input id="e-trab" class="input-upper" required /></label>
        <label>PRODUCTO EPP / HERRAMIENTA<input id="e-prod" class="input-upper" required /></label>
        <label>CANTIDAD<input id="e-cantidad" type="number" min="1" step="1" value="1" required /></label>
        <label>FECHA DE ENTREGA<input id="e-fecha" type="date" class="input-upper" required /></label>
        <div class="form-actions"><button type="submit" class="btn btn-primary">GUARDAR</button></div>
      </form>
      <div class="card baja-card">
        <h3 class="sub-title">BAJA DE PERSONAL</h3>
        <p class="hint">MARCA COMO INACTIVOS TODOS LOS REGISTROS DEL TRABAJADOR (RENUNCIA / DESPIDO).</p>
        <div class="inline-actions">
          <input id="e-baja-trab" class="input-upper" placeholder="NOMBRE DEL TRABAJADOR" />
          <button type="button" class="btn btn-danger" id="e-baja-btn">ELIMINAR REGISTRO (BAJA PERSONAL)</button>
        </div>
      </div>` : ''}
      <div class="toolbar">
        <input id="e-buscar" class="input-upper" placeholder="BUSCAR TRABAJADOR O PRODUCTO" />
        <label class="chk-label"><input type="checkbox" id="e-solo-activos" checked /> SOLO ACTIVOS</label>
        <button type="button" class="btn btn-secondary" id="e-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table" id="tabla-epp">
          <thead><tr><th>TRABAJADOR</th><th>PRODUCTO</th><th>CANTIDAD</th><th>FECHA ENTREGA</th><th>DÍAS DESDE ÚLTIMA ENTREGA</th><th>ACTIVO</th>${puedeEditar ? '<th>ACCIONES</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;

  const fecha = host.querySelector('#e-fecha');
  if (fecha) fecha.value = new Date().toISOString().slice(0, 10);

  if (puedeEditar) {
    host.querySelector('#form-epp').addEventListener('submit', (ev) => guardarEpp(ev, host, puedeEditar));
    host.querySelector('#e-baja-btn').addEventListener('click', () => bajaPersonal(host, puedeEditar));
    const acList = [];
    const inTrab = host.querySelector('#e-trab');
    const inProd = host.querySelector('#e-prod');
    if (inTrab) acList.push(attachAutocomplete(inTrab, { loadValues: cargarNombresPersonalActivo }));
    if (inProd) acList.push(attachAutocomplete(inProd, { loadValues: cargarProductosNombres }));
    host._spaCleanup = () => {
      acList.forEach((ac) => ac.destroy());
      delete host._eppAcRefresh;
    };
    host._eppAcRefresh = async () => {
      for (const ac of acList) await ac.refresh();
    };
  }
  host.querySelector('#e-buscar').addEventListener('input', () => refrescarEpp(host, puedeEditar));
  host.querySelector('#e-solo-activos').addEventListener('change', () => refrescarEpp(host, puedeEditar));
  host.querySelector('#e-excel').addEventListener('click', () => excelEpp(host));

  await refrescarEpp(host, puedeEditar);
}

/**
 * Inserta entrega activa.
 */
async function guardarEpp(ev, root, puedeEditar) {
  ev.preventDefault();
  const trabajador = root.querySelector('#e-trab').value.trim();
  const producto = root.querySelector('#e-prod').value.trim();
  const cantidadRaw = Number(root.querySelector('#e-cantidad').value);
  const cantidad = Number.isFinite(cantidadRaw) && cantidadRaw >= 1 ? Math.trunc(cantidadRaw) : 1;
  const fecha_entrega = root.querySelector('#e-fecha').value;
  if (!trabajador || !producto || !fecha_entrega) {
    notifyError('COMPLETE EL FORMULARIO.');
    return;
  }
  try {
    const { error } = await supabase.from('epp_herramientas').insert({ trabajador, producto, cantidad, fecha_entrega, activo: true });
    if (error) throw error;
    notifyOk('ENTREGA REGISTRADA.');
    root.querySelector('#form-epp').reset();
    root.querySelector('#e-cantidad').value = '1';
    root.querySelector('#e-fecha').value = new Date().toISOString().slice(0, 10);
    await refrescarEpp(root, puedeEditar);
    if (typeof root._eppAcRefresh === 'function') await root._eppAcRefresh();
  } catch (err) {
    console.error(err);
    notifyError(err.message || 'ERROR.');
  }
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Construye filas con métrica de frecuencia por pareja trabajador+producto.
 */
function enriquecerFilas(rows) {
  const sorted = [...rows].sort((a, b) => {
    const k1 = `${a.trabajador}|||${a.producto}`;
    const k2 = `${b.trabajador}|||${b.producto}`;
    if (k1 !== k2) return k1.localeCompare(k2);
    return String(a.fecha_entrega).localeCompare(String(b.fecha_entrega));
  });
  /** @type {Map<string, string>} */
  const ultimaFecha = new Map();
  return sorted.map((r) => {
    const key = `${r.trabajador}|||${r.producto}`;
    const prev = ultimaFecha.get(key);
    let dias = 0;
    if (prev) dias = diasEntre(prev, r.fecha_entrega);
    ultimaFecha.set(key, r.fecha_entrega);
    return { ...r, dias_desde: prev ? dias : 0 };
  });
}

/**
 * Lista y filtra registros EPP.
 */
async function refrescarEpp(root, puedeEditar) {
  const q = root.querySelector('#e-buscar').value.trim().toLowerCase();
  const soloActivos = root.querySelector('#e-solo-activos').checked;
  const { data, error } = await supabase.from('epp_herramientas').select('*').order('fecha_entrega', { ascending: true });
  if (error) {
    notifyError(error.message);
    return;
  }
  let rows = data || [];
  if (soloActivos) rows = rows.filter((r) => r.activo);
  rows = rows.filter((r) => {
    const blob = `${r.trabajador} ${r.producto}`.toLowerCase();
    return !q || blob.includes(q);
  });
  const enriched = enriquecerFilas(rows).sort((a, b) => String(b.fecha_entrega).localeCompare(String(a.fecha_entrega)));

  const tbody = root.querySelector('#tabla-epp tbody');
  tbody.innerHTML = '';
  for (const r of enriched) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.trabajador)}</td>
      <td>${esc(r.producto)}</td>
      <td>${Number(r.cantidad) > 0 ? Number(r.cantidad) : 1}</td>
      <td>${formatearFecha(r.fecha_entrega)}</td>
      <td>${r.dias_desde}</td>
      <td>${r.activo ? 'SÍ' : 'NO'}</td>
      ${
        puedeEditar
          ? `<td class="table-actions">
        <button type="button" class="btn btn-sm btn-danger" data-ed="${r.id}">ELIMINAR</button>
      </td>`
          : ''
      }`;
    tbody.appendChild(tr);
  }
  if (puedeEditar) {
    tbody.querySelectorAll('button[data-ed]').forEach((b) => b.addEventListener('click', () => borrarFilaEpp(root, b.dataset.ed, puedeEditar)));
  }
}

/**
 * Elimina una fila puntual.
 */
async function borrarFilaEpp(root, id, puedeEditar) {
  if (!window.confirm('¿ELIMINAR ESTE REGISTRO?')) return;
  try {
    const { error } = await supabase.from('epp_herramientas').delete().eq('id', id);
    if (error) throw error;
    notifyOk('REGISTRO ELIMINADO.');
    await refrescarEpp(root, puedeEditar);
    if (typeof root._eppAcRefresh === 'function') await root._eppAcRefresh();
  } catch (err) {
    console.error(err);
    notifyError('ERROR AL ELIMINAR.');
  }
}

/**
 * Desactiva todos los registros de un trabajador (baja).
 */
async function bajaPersonal(root, puedeEditar) {
  const trab = root.querySelector('#e-baja-trab').value.trim();
  if (!trab) {
    notifyError('INDIQUE EL NOMBRE DEL TRABAJADOR.');
    return;
  }
  if (!window.confirm(`¿DAR DE BAJA TODOS LOS REGISTROS ACTIVOS DE ${trab}?`)) return;
  try {
    const { error } = await supabase.from('epp_herramientas').update({ activo: false }).eq('trabajador', trab).eq('activo', true);
    if (error) throw error;
    notifyOk('REGISTROS DESACTIVADOS.');
    root.querySelector('#e-baja-trab').value = '';
    await refrescarEpp(root, puedeEditar);
    if (typeof root._eppAcRefresh === 'function') await root._eppAcRefresh();
  } catch (err) {
    console.error(err);
    notifyError('ERROR EN LA BAJA.');
  }
}

async function excelEpp(root) {
  try {
    const { data, error } = await supabase.from('epp_herramientas').select('*').order('fecha_entrega', { ascending: true });
    if (error) throw error;
    const soloActivos = root.querySelector('#e-solo-activos').checked;
    const q = root.querySelector('#e-buscar').value.trim().toLowerCase();
    let rows = data || [];
    if (soloActivos) rows = rows.filter((r) => r.activo);
    rows = rows.filter((r) => {
      const blob = `${r.trabajador} ${r.producto}`.toLowerCase();
      return !q || blob.includes(q);
    });
    const enriched = enriquecerFilas(rows).sort((a, b) => String(b.fecha_entrega).localeCompare(String(a.fecha_entrega)));
    const filas = enriched.map((r) => ({
      TRABAJADOR: r.trabajador,
      PRODUCTO: r.producto,
      CANTIDAD: Number(r.cantidad) > 0 ? Number(r.cantidad) : 1,
      FECHA_ENTREGA: formatearFecha(r.fecha_entrega),
      DIAS_DESDE_ULTIMA: r.dias_desde,
      ACTIVO: r.activo ? 'SÍ' : 'NO',
    }));
    exportarExcel('EPP_PETRO_ASEO', 'EPP', filas);
    notifyOk('EXCEL GENERADO.');
  } catch (err) {
    console.error(err);
    notifyError('ERROR EXPORTANDO.');
  }
}
