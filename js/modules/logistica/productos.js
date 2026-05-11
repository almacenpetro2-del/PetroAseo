/**
 * Submódulo PRODUCTOS — CRUD y stock mostrado (actualizado por movimientos).
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { requerido } from '../../utils/validators.js';

/**
 * Inicializa el panel de productos.
 * @param {HTMLElement} host Panel contenedor
 * @param {boolean} puedeEditar Permisos
 */
export async function iniciarPanelProductos(host, puedeEditar) {
  host.innerHTML = `
    <div class="submodule-panel">
      ${puedeEditar ? `
      <form id="form-producto" class="form-grid card op-form-card">
        <input type="hidden" id="p-id" />
        <label>NOMBRE DEL PRODUCTO<input id="p-nombre" class="input-upper" required /></label>
        <label>UNIDAD DE MEDIDA<input id="p-unidad" class="input-upper" required /></label>
        <label>CATEGORÍA<input id="p-categoria" class="input-upper" required /></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">GUARDAR</button>
          <button type="button" class="btn btn-ghost" id="p-cancel">CANCELAR</button>
        </div>
      </form>` : '<p class="hint">SOLO LECTURA PARA SU ROL.</p>'}
      <div class="toolbar">
        <input id="p-buscar" class="input-upper" placeholder="BUSCAR PRODUCTO..." />
      </div>
      <div class="card table-wrap">
        <table class="data-table" id="tabla-productos">
          <thead><tr><th>NOMBRE</th><th>UNIDAD</th><th>CANTIDAD (STOCK)</th><th>CATEGORÍA</th>${puedeEditar ? '<th>ACCIONES</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>`;

  if (puedeEditar) {
    host.querySelector('#form-producto').addEventListener('submit', (ev) => onGuardarProducto(ev, host));
    host.querySelector('#p-cancel').addEventListener('click', () => resetProductoForm(host));
  }
  host.querySelector('#p-buscar').addEventListener('input', () => refrescarProductos(host, puedeEditar));
  await refrescarProductos(host, puedeEditar);
}

/**
 * Lista productos desde Supabase.
 * @param {HTMLElement} root Módulo
 * @param {boolean} puedeEditar Si muestra acciones
 */
async function refrescarProductos(root, puedeEditar) {
  const tbody = root.querySelector('#tabla-productos tbody');
  tbody.innerHTML = '';
  const { data, error } = await supabase.from('productos').select('*').order('nombre');
  if (error) {
    notifyError(error.message);
    return;
  }
  const q = root.querySelector('#p-buscar')?.value.trim().toLowerCase() || '';
  const rows = (data || []).filter((r) => !q || String(r.nombre || '').toLowerCase().includes(q));
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(row.nombre)}</td>
      <td>${esc(row.unidad_medida)}</td>
      <td>${row.cantidad_stock}</td>
      <td>${esc(row.categoria)}</td>
      ${
        puedeEditar
          ? `<td class="table-actions">
          <button type="button" class="btn btn-sm" data-e="1" data-id="${row.id}">EDITAR</button>
          <button type="button" class="btn btn-sm btn-danger" data-d="1" data-id="${row.id}">ELIMINAR</button>
        </td>`
          : ''
      }`;
    tbody.appendChild(tr);
  }
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="${puedeEditar ? 5 : 4}">NO SE ENCONTRARON PRODUCTOS</td>`;
    tbody.appendChild(tr);
  }
  if (puedeEditar) {
    tbody.querySelectorAll('button[data-e]').forEach((b) => b.addEventListener('click', () => editarProducto(root, b.dataset.id)));
    tbody.querySelectorAll('button[data-d]').forEach((b) => b.addEventListener('click', () => eliminarProducto(root, b.dataset.id)));
  }
}

/**
 * escape HTML
 */
function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Limpia formulario producto.
 */
function resetProductoForm(root) {
  root.querySelector('#p-id').value = '';
  root.querySelector('#p-nombre').value = '';
  root.querySelector('#p-unidad').value = '';
  root.querySelector('#p-categoria').value = '';
}

/**
 * Guarda insert/update producto (no modifica stock manualmente).
 */
async function onGuardarProducto(ev, root) {
  ev.preventDefault();
  const id = root.querySelector('#p-id').value;
  const nombre = root.querySelector('#p-nombre').value.trim();
  const unidad_medida = root.querySelector('#p-unidad').value.trim();
  const categoria = root.querySelector('#p-categoria').value.trim();
  if (!requerido(nombre) || !requerido(unidad_medida) || !requerido(categoria)) {
    notifyError('COMPLETE TODOS LOS CAMPOS.');
    return;
  }
  try {
    if (!id) {
      const { error } = await supabase.from('productos').insert({ nombre, unidad_medida, categoria });
      if (error) throw error;
      notifyOk('PRODUCTO GUARDADO.');
    } else {
      const { error } = await supabase.from('productos').update({ nombre, unidad_medida, categoria }).eq('id', id);
      if (error) throw error;
      notifyOk('PRODUCTO ACTUALIZADO.');
    }
    resetProductoForm(root);
    await refrescarProductos(root, true);
  } catch (err) {
    console.error(err);
    notifyError(err.message || 'ERROR AL GUARDAR.');
  }
}

/**
 * Carga producto en formulario.
 */
async function editarProducto(root, id) {
  const { data, error } = await supabase.from('productos').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    notifyError('NO SE PUDO CARGAR.');
    return;
  }
  root.querySelector('#p-id').value = data.id;
  root.querySelector('#p-nombre').value = data.nombre;
  root.querySelector('#p-unidad').value = data.unidad_medida;
  root.querySelector('#p-categoria').value = data.categoria;
}

/**
 * Borra producto si no tiene movimientos vinculados.
 */
async function eliminarProducto(root, id) {
  if (!window.confirm('¿ELIMINAR PRODUCTO?')) return;
  try {
    const { error } = await supabase.from('productos').delete().eq('id', id);
    if (error) throw error;
    notifyOk('PRODUCTO ELIMINADO.');
    await refrescarProductos(root, true);
  } catch (err) {
    console.error(err);
    notifyError('NO SE PUEDE ELIMINAR SI TIENE MOVIMIENTOS ASOCIADOS.');
  }
}
