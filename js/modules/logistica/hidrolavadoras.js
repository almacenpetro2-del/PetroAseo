/**
 * Submódulo HIDROLAVADORAS — consumo interno sin impacto en stock.
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { enteroPositivo, formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';

/**
 * Productos registrados (sugerencias desde productos).
 */
async function cargarProductosNombres() {
  const { data, error } = await supabase.from('productos').select('nombre').order('nombre');
  if (error) throw error;
  return (data || []).map((r) => r.nombre);
}

/**
 * Inicializa panel de hidrolavadoras.
 * @param {HTMLElement} host Panel contenedor
 * @param {boolean} puedeEditar Permisos
 */
export async function iniciarPanelHidrolavadoras(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      ${puedeEditar ? `
      <form id="form-hidro" class="form-grid card op-form-card">
        <label>HIDROLAVADORA<input id="h-nombre" class="input-upper" required /></label>
        <label>PRODUCTO UTILIZADO<input id="h-producto" class="input-upper" required /></label>
        <label>CANTIDAD<input id="h-cantidad" type="number" min="1" class="input-upper" required /></label>
        <label>FECHA<input id="h-fecha" type="date" class="input-upper" required /></label>
        <div class="form-actions"><button type="submit" class="btn btn-primary">GUARDAR</button></div>
      </form>` : ''}
      <div class="toolbar">
        <input id="h-buscar" class="input-upper" placeholder="BUSCAR" />
        <button type="button" class="btn btn-secondary" id="h-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table" id="tabla-hidro">
          <thead><tr><th>HIDROLAVADORA</th><th>PRODUCTO</th><th>CANTIDAD</th><th>FECHA</th>${puedeEditar ? '<th>ACCIONES</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;

  const fecha = host.querySelector('#h-fecha');
  if (fecha) fecha.value = new Date().toISOString().slice(0, 10);

  if (puedeEditar) {
    host.querySelector('#form-hidro').addEventListener('submit', (ev) => guardarHidro(ev, host, puedeEditar));
    const hProd = host.querySelector('#h-producto');
    if (hProd) {
      const ac = attachAutocomplete(hProd, { loadValues: cargarProductosNombres });
      host._spaCleanup = () => {
        ac.destroy();
        delete host._hidroAcRefresh;
      };
      host._hidroAcRefresh = () => ac.refresh();
    }
  }
  host.querySelector('#h-buscar').addEventListener('input', () => refrescarHidro(host, puedeEditar));
  host.querySelector('#h-excel').addEventListener('click', () => excelHidro(host));

  await refrescarHidro(host, puedeEditar);
}

/**
 * Inserta registro en tabla hidrolavadoras.
 */
async function guardarHidro(ev, root, puedeEditar) {
  ev.preventDefault();
  const form = root.querySelector('#form-hidro');
  const editId = form.dataset.editId || '';
  const hidrolavadora = root.querySelector('#h-nombre').value.trim();
  const producto = root.querySelector('#h-producto').value.trim();
  const cantidad = enteroPositivo(root.querySelector('#h-cantidad').value);
  const fecha = root.querySelector('#h-fecha').value;
  if (!hidrolavadora || !producto || Number.isNaN(cantidad) || !fecha) {
    notifyError('COMPLETE EL FORMULARIO.');
    return;
  }
  try {
    if (editId) {
      const { error } = await supabase.from('hidrolavadoras').update({ hidrolavadora, producto, cantidad, fecha }).eq('id', editId);
      if (error) throw error;
      notifyOk('REGISTRO ACTUALIZADO.');
    } else {
      const { error } = await supabase.from('hidrolavadoras').insert({ hidrolavadora, producto, cantidad, fecha });
      if (error) throw error;
      notifyOk('REGISTRO GUARDADO.');
    }
    delete form.dataset.editId;
    form.reset();
    root.querySelector('#h-fecha').value = new Date().toISOString().slice(0, 10);
    form.querySelector('button[type="submit"]').textContent = 'GUARDAR';
    await refrescarHidro(root, puedeEditar);
    if (typeof root._hidroAcRefresh === 'function') await root._hidroAcRefresh();
  } catch (err) {
    console.error(err);
    notifyError(err.message || 'ERROR AL GUARDAR.');
  }
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Lista registros con filtro de búsqueda.
 */
async function refrescarHidro(root, puedeEditar) {
  const q = root.querySelector('#h-buscar').value.trim().toLowerCase();
  const { data, error } = await supabase.from('hidrolavadoras').select('*').order('fecha', { ascending: false });
  if (error) {
    notifyError(error.message);
    return;
  }
  const rows = (data || []).filter((r) => {
    const blob = `${r.hidrolavadora} ${r.producto}`.toLowerCase();
    return !q || blob.includes(q);
  });
  const tbody = root.querySelector('#tabla-hidro tbody');
  tbody.innerHTML = '';
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(r.hidrolavadora)}</td>
      <td>${esc(r.producto)}</td>
      <td>${r.cantidad}</td>
      <td>${formatearFecha(r.fecha)}</td>
      ${
        puedeEditar
          ? `<td class="table-actions">
        <button type="button" class="btn btn-sm" data-he="${r.id}">EDITAR</button>
        <button type="button" class="btn btn-sm btn-danger" data-hd="${r.id}">ELIMINAR</button>
      </td>`
          : ''
      }`;
    tbody.appendChild(tr);
  }
  if (puedeEditar) {
    tbody.querySelectorAll('button[data-he]').forEach((b) => b.addEventListener('click', () => editarHidro(root, b.dataset.he, puedeEditar)));
    tbody.querySelectorAll('button[data-hd]').forEach((b) => b.addEventListener('click', () => borrarHidro(root, b.dataset.hd, puedeEditar)));
  }
}

/**
 * Copia la fila seleccionada al formulario y marca modo edición.
 */
async function editarHidro(root, id, puedeEditar) {
  const { data, error } = await supabase.from('hidrolavadoras').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    notifyError('NO SE PUDO CARGAR.');
    return;
  }
  root.querySelector('#h-nombre').value = data.hidrolavadora;
  root.querySelector('#h-producto').value = data.producto;
  root.querySelector('#h-cantidad').value = data.cantidad;
  root.querySelector('#h-fecha').value = data.fecha;

  const form = root.querySelector('#form-hidro');
  form.dataset.editId = id;
  const btn = form.querySelector('button[type="submit"]');
  btn.textContent = 'ACTUALIZAR';
}

async function borrarHidro(root, id, puedeEditar) {
  if (!window.confirm('¿ELIMINAR REGISTRO?')) return;
  try {
    const { error } = await supabase.from('hidrolavadoras').delete().eq('id', id);
    if (error) throw error;
    notifyOk('ELIMINADO.');
    await refrescarHidro(root, puedeEditar);
    if (typeof root._hidroAcRefresh === 'function') await root._hidroAcRefresh();
  } catch (err) {
    console.error(err);
    notifyError('ERROR AL ELIMINAR.');
  }
}

async function excelHidro(root) {
  try {
    const { data, error } = await supabase.from('hidrolavadoras').select('*').order('fecha', { ascending: false });
    if (error) throw error;
    const q = root.querySelector('#h-buscar').value.trim().toLowerCase();
    const rows = (data || []).filter((r) => {
      const blob = `${r.hidrolavadora} ${r.producto}`.toLowerCase();
      return !q || blob.includes(q);
    });
    const filas = rows.map((r) => ({
      HIDROLAVADORA: r.hidrolavadora,
      PRODUCTO: r.producto,
      CANTIDAD: r.cantidad,
      FECHA: formatearFecha(r.fecha),
    }));
    exportarExcel('HIDROLAVADORAS_PETRO_ASEO', 'HIDROLAVADORAS', filas);
    notifyOk('EXCEL GENERADO.');
  } catch (err) {
    console.error(err);
    notifyError('ERROR EXPORTANDO.');
  }
}
