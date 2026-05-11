/**
 * Submódulo MOVIMIENTOS — corregido con validaciones de elementos DOM
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { enteroPositivo, formatearFecha } from '../../utils/validators.js';
import { exportarExcel } from '../../utils/excel.js';
import { attachAutocomplete } from '../../utils/autocomplete.js';

/** @type {{producto_id:string,cantidad:number,tipo:string,fecha:string,asignado_a:string}[]} */
let borrador = [];

/** Mapa nombre → id de productos para resolver IDs desde autocompletado. */
const productoMap = new Map();

/**
 * Nombres únicos de personal activo (sugerencias para asignado_a).
 */
async function cargarNombresPersonalActivo() {
  const { data, error } = await supabase.from('personal_activo').select('nombres');
  if (error) throw error;
  return (data || []).map((r) => r.nombres);
}

/**
 * Nombres de productos (sugerencias + llena productoMap).
 */
async function cargarProductosNombres() {
  productoMap.clear();
  const { data, error } = await supabase.from('productos').select('id,nombre').order('nombre');
  if (error) throw error;
  for (const p of data || []) {
    productoMap.set(p.nombre.toUpperCase(), p.id);
  }
  return (data || []).map((p) => p.nombre);
}

/**
 * Inicializa panel de movimientos.
 * @param {HTMLElement} host Panel contenedor
 * @param {boolean} puedeEditar Permisos
 */
export async function iniciarPanelMovimientos(host, puedeEditar) {
  borrador = [];

  host.innerHTML = `
    <div class="submodule-panel">
      ${puedeEditar ? `
      <form id="form-mov-borrador" class="form-grid card op-form-card">
        <label>PRODUCTO<input id="m-producto" class="input-upper" placeholder="ESCRIBA PARA BUSCAR..." required /></label>
        <label>CANTIDAD<input id="m-cantidad" type="number" min="1" class="input-upper" required /></label>
        <label>TIPO<select id="m-tipo" class="input-upper"><option value="entrada">ENTRADA</option><option value="salida">SALIDA</option></select></label>
        <label>FECHA<input id="m-fecha" type="date" class="input-upper" required /></label>
        <label>ASIGNADO A<input id="m-asignado" class="input-upper" placeholder="PERSONAL, VEHÍCULO O ÁREA" /></label>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" id="m-agregar">AGREGAR</button>
          <button type="button" class="btn btn-primary" id="m-guardar-todo">GUARDAR SOLICITUD</button>
        </div>
      </form>
      <div class="card">
        <h3 class="sub-title">BORRADOR</h3>
        <div class="table-wrap"><table class="data-table" id="tabla-borrador"><thead><tr><th>PRODUCTO</th><th>CANT.</th><th>TIPO</th><th>FECHA</th><th>ASIGNADO</th><th></th></tr></thead><tbody></tbody></table></div>
      </div>` : ''}

      <div class="toolbar">
        <input id="m-buscar" class="input-upper" placeholder="BUSCAR POR PRODUCTO O ASIGNADO" />
        <button type="button" class="btn btn-secondary" id="m-excel">DESCARGAR EXCEL</button>
      </div>
      <div class="card table-wrap">
        <table class="data-table" id="tabla-movs">
          <thead><tr><th>FECHA</th><th>PRODUCTO</th><th>CANTIDAD</th><th>TIPO</th><th>ASIGNADO A</th>${puedeEditar ? '<th>ACCIONES</th>' : ''}</tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <dialog id="dlg-edit-mov" class="modal">
        <form id="form-edit-mov" class="form-grid">
          <input type="hidden" id="em-id" />
          <label>PRODUCTO<input id="em-producto" class="input-upper" placeholder="ESCRIBA PARA BUSCAR..." required /></label>
          <label>CANTIDAD<input id="em-cantidad" type="number" min="1" required /></label>
          <label>TIPO<select id="em-tipo" class="input-upper"><option value="entrada">ENTRADA</option><option value="salida">SALIDA</option></select></label>
          <label>FECHA<input id="em-fecha" type="date" required /></label>
          <label>ASIGNADO A<input id="em-asignado" class="input-upper" /></label>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" id="em-cerrar">CERRAR</button>
            <button type="submit" class="btn btn-primary">GUARDAR CAMBIOS</button>
          </div>
        </form>
      </dialog>
    </div>`;

  const inputProducto = host.querySelector('#m-producto');
  const inputEmProducto = host.querySelector('#em-producto');

  if (!inputProducto || !inputEmProducto) {
    console.error('No se encontraron los inputs de productos');
    return;
  }

  const productos = await cargarProductosNombres();
  host._productosCache = productos;
  host._productoMap = productoMap;

  const hoy = new Date().toISOString().slice(0, 10);
  const fechaInput = host.querySelector('#m-fecha');
  if (fechaInput) fechaInput.value = hoy;

  if (puedeEditar) {
    const btnAgregar = host.querySelector('#m-agregar');
    const btnGuardar = host.querySelector('#m-guardar-todo');
    if (btnAgregar) btnAgregar.addEventListener('click', () => agregarBorrador(host, productos));
    if (btnGuardar) btnGuardar.addEventListener('click', () => guardarBorrador(host));
  }

  const btnExcel = host.querySelector('#m-excel');
  const inputBuscar = host.querySelector('#m-buscar');
  if (btnExcel) btnExcel.addEventListener('click', () => descargarExcel(host));
  if (inputBuscar) inputBuscar.addEventListener('input', () => refrescarMovimientos(host, puedeEditar, productos));

  const dlg = host.querySelector('#dlg-edit-mov');
  const btnCerrar = host.querySelector('#em-cerrar');
  if (btnCerrar && dlg) btnCerrar.addEventListener('click', () => dlg.close());

  const acInstances = [];
  const asMain = host.querySelector('#m-asignado');
  const asEdit = host.querySelector('#em-asignado');
  if (asMain) acInstances.push(attachAutocomplete(asMain, { loadValues: cargarNombresPersonalActivo }));
  if (asEdit) acInstances.push(attachAutocomplete(asEdit, { loadValues: cargarNombresPersonalActivo }));
  if (inputProducto) acInstances.push(attachAutocomplete(inputProducto, { loadValues: cargarProductosNombres }));
  if (inputEmProducto) acInstances.push(attachAutocomplete(inputEmProducto, { loadValues: cargarProductosNombres }));
  host._spaCleanup = () => {
    acInstances.forEach((ac) => ac.destroy());
    delete host._movimientosAcRefresh;
  };
  host._movimientosAcRefresh = async () => {
    for (const ac of acInstances) await ac.refresh();
  };

  await refrescarMovimientos(host, puedeEditar, productos);

  host._dlgEditMov = dlg;
}

/**
 * Agrega línea al borrador local.
 */
function agregarBorrador(root, productos) {
  const inputProducto = root.querySelector('#m-producto');
  const inputCantidad = root.querySelector('#m-cantidad');
  const selectTipo = root.querySelector('#m-tipo');
  const inputFecha = root.querySelector('#m-fecha');
  const inputAsignado = root.querySelector('#m-asignado');

  if (!inputProducto || !inputCantidad || !selectTipo || !inputFecha) {
    notifyError('FORMULARIO INCOMPLETO.');
    return;
  }

  const nombreProducto = inputProducto.value.trim().toUpperCase();
  const map = root._productoMap || productoMap;
  const producto_id = map.get(nombreProducto);
  const cantidad = enteroPositivo(inputCantidad.value);
  const tipo = selectTipo.value;
  const fecha = inputFecha.value;
  const asignado_a = inputAsignado ? inputAsignado.value.trim() : '';

  if (!producto_id || !fecha || Number.isNaN(cantidad)) {
    notifyError('COMPLETE PRODUCTO, CANTIDAD VÁLIDA Y FECHA.');
    return;
  }

  borrador.push({ producto_id, cantidad, tipo, fecha, asignado_a });
  pintarBorrador(root, productos);
  inputCantidad.value = '';
  notifyOk('ÍTEM AGREGADO AL BORRADOR.');
}

/**
 * Pinta tabla borrador.
 */
function pintarBorrador(root, productos) {
  const tbody = root.querySelector('#tabla-borrador tbody');
  if (!tbody) {
    console.warn('⚠️ Tabla borrador no encontrada');
    return;
  }

  tbody.innerHTML = '';
  const map = root._productoMap || productoMap;
  const nombre = (id) => {
    for (const [n, i] of map) if (i === id) return n;
    return id;
  };

  borrador.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nombre(row.producto_id)}</td>
      <td>${row.cantidad}</td>
      <td>${row.tipo.toUpperCase()}</td>
      <td>${formatearFecha(row.fecha)}</td>
      <td>${esc(row.asignado_a)}</td>
      <td><button type="button" class="btn btn-sm btn-danger" data-i="${idx}">QUITAR</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      borrador.splice(Number(b.dataset.i), 1);
      pintarBorrador(root, productos);
    })
  );
}

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

/**
 * Persiste cada línea del borrador mediante RPC registrar_movimiento.
 */
async function guardarBorrador(root) {
  if (!borrador.length) {
    notifyError('EL BORRADOR ESTÁ VACÍO.');
    return;
  }

  try {
    for (const line of borrador) {
      const { error } = await supabase.rpc('registrar_movimiento', {
        p_producto_id: line.producto_id,
        p_cantidad: line.cantidad,
        p_tipo: line.tipo,
        p_fecha: line.fecha,
        p_asignado_a: line.asignado_a,
      });
      if (error) throw error;
    }
    borrador = [];
    pintarBorrador(root, root._productosCache || []);
    notifyOk('MOVIMIENTOS REGISTRADOS.');
    await refrescarMovimientos(root, true, root._productosCache || []);
    if (typeof root._movimientosAcRefresh === 'function') await root._movimientosAcRefresh();
  } catch (err) {
    console.error(err);
    const msg = err.message || '';
    if (msg.includes('STOCK_INSUFICIENTE')) notifyError('STOCK INSUFICIENTE PARA UNA SALIDA.');
    else notifyError(msg || 'ERROR AL GUARDAR MOVIMIENTOS.');
  }
}

/**
 * Lista movimientos con join productos y filtro texto.
 * ✅ CORREGIDO: Validación de elementos antes de manipular DOM
 */
async function refrescarMovimientos(root, puedeEditar, productos) {
  // ✅ Validar que el buscador existe
  const inputBuscar = root.querySelector('#m-buscar');
  const q = inputBuscar ? inputBuscar.value.trim().toLowerCase() : '';

  try {
    const { data, error } = await supabase
      .from('movimientos')
      .select('id, cantidad, tipo, fecha, asignado_a, productos(nombre)')
      .order('fecha', { ascending: false });

    if (error) {
      notifyError(error.message);
      return;
    }

    const rows = (data || []).filter((r) => {
      const nom = (r.productos?.nombre || '').toLowerCase();
      const asg = (r.asignado_a || '').toLowerCase();
      return !q || nom.includes(q) || asg.includes(q);
    });

    // ✅ VALIDACIÓN CRÍTICA: Verificar que el tbody existe
    const tbody = root.querySelector('#tabla-movs tbody');
    
    if (!tbody) {
      console.error('❌ No se encontró el tbody de la tabla movimientos');
      console.log('Contenido del root:', root.innerHTML.substring(0, 200));
      return; // Salir sin hacer nada si no existe
    }

    // Limpiar tabla
    tbody.innerHTML = '';

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${puedeEditar ? 6 : 5}" style="text-align:center; padding:20px;">NO HAY MOVIMIENTOS REGISTRADOS</td></tr>`;
      return;
    }

    // Renderizar filas
    for (const r of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatearFecha(r.fecha)}</td>
        <td>${esc(r.productos?.nombre)}</td>
        <td>${r.cantidad}</td>
        <td>${r.tipo.toUpperCase()}</td>
        <td>${esc(r.asignado_a)}</td>
        ${
          puedeEditar
            ? `<td class="table-actions">
          <button type="button" class="btn btn-sm" data-ed="${r.id}">EDITAR</button>
          <button type="button" class="btn btn-sm btn-danger" data-de="${r.id}">ELIMINAR</button>
        </td>`
            : ''
        }`;
      tbody.appendChild(tr);
    }

    // Agregar event listeners si tiene permisos
    if (puedeEditar) {
      tbody.querySelectorAll('button[data-ed]').forEach((b) =>
        b.addEventListener('click', () => abrirEditarMov(root, b.dataset.ed, productos))
      );
      tbody.querySelectorAll('button[data-de]').forEach((b) =>
        b.addEventListener('click', () => borrarMovimiento(root, b.dataset.de, puedeEditar, productos))
      );
    }
  } catch (err) {
    console.error('Error en refrescarMovimientos:', err);
    notifyError('ERROR AL CARGAR MOVIMIENTOS.');
  }
}

/**
 * Elimina movimiento vía RPC eliminar_movimiento.
 */
async function borrarMovimiento(root, id, puedeEditar, productos) {
  if (!window.confirm('¿ELIMINAR MOVIMIENTO Y REVERTIR STOCK?')) return;
  
  try {
    const { error } = await supabase.rpc('eliminar_movimiento', { p_movimiento_id: id });
    if (error) throw error;
    notifyOk('MOVIMIENTO ELIMINADO.');
    await refrescarMovimientos(root, puedeEditar, productos);
    if (typeof root._movimientosAcRefresh === 'function') await root._movimientosAcRefresh();
  } catch (err) {
    console.error(err);
    notifyError(err.message || 'ERROR AL ELIMINAR.');
  }
}

/**
 * Abre modal de edición y envía RPC actualizar_movimiento.
 */
async function abrirEditarMov(root, id, productos) {
  const { data, error } = await supabase.from('movimientos').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    notifyError('NO SE PUDO CARGAR MOVIMIENTO.');
    return;
  }

  const dlg = root.querySelector('#dlg-edit-mov');
  if (!dlg) {
    console.error('❌ Modal de edición no encontrado');
    return;
  }

  // ✅ Validar que todos los campos del modal existen
  const emId = root.querySelector('#em-id');
  const emProducto = root.querySelector('#em-producto');
  const emCantidad = root.querySelector('#em-cantidad');
  const emTipo = root.querySelector('#em-tipo');
  const emFecha = root.querySelector('#em-fecha');
  const emAsignado = root.querySelector('#em-asignado');

  if (!emId || !emProducto || !emCantidad || !emTipo || !emFecha) {
    console.error('❌ Campos del modal no encontrados');
    return;
  }

  emId.value = data.id;
  const map = root._productoMap || productoMap;
  let prodName = data.producto_id;
  for (const [n, i] of map) if (i === data.producto_id) { prodName = n; break; }
  emProducto.value = prodName;
  emCantidad.value = data.cantidad;
  emTipo.value = data.tipo;
  emFecha.value = data.fecha;
  if (emAsignado) emAsignado.value = data.asignado_a || '';

  const form = root.querySelector('#form-edit-mov');
  if (!form) return;

  form.onsubmit = async (ev) => {
    ev.preventDefault();
    const mid = emId.value;
    const nombreProducto = emProducto.value.trim().toUpperCase();
    const pmap = root._productoMap || productoMap;
    const pid = pmap.get(nombreProducto);
    const cant = enteroPositivo(emCantidad.value);
    const tipo = emTipo.value;
    const fecha = emFecha.value;
    const asg = emAsignado ? emAsignado.value.trim() : '';

    if (!mid || !pid || !fecha || Number.isNaN(cant)) {
      notifyError('DATOS INVÁLIDOS.');
      return;
    }

    try {
      const { error: e2 } = await supabase.rpc('actualizar_movimiento', {
        p_movimiento_id: mid,
        p_producto_id: pid,
        p_cantidad: cant,
        p_tipo: tipo,
        p_fecha: fecha,
        p_asignado_a: asg,
      });
      if (e2) throw e2;
      dlg.close();
      notifyOk('MOVIMIENTO ACTUALIZADO.');
      await refrescarMovimientos(root, true, productos);
      if (typeof root._movimientosAcRefresh === 'function') await root._movimientosAcRefresh();
    } catch (err) {
      console.error(err);
      if ((err.message || '').includes('STOCK_INSUFICIENTE')) notifyError('STOCK INSUFICIENTE.');
      else notifyError(err.message || 'ERROR AL ACTUALIZAR.');
    }
  };

  dlg.showModal();
}

/**
 * Exporta movimientos visibles a Excel.
 */
async function descargarExcel(root) {
  try {
    const { data, error } = await supabase
      .from('movimientos')
      .select('fecha, cantidad, tipo, asignado_a, productos(nombre)')
      .order('fecha', { ascending: false });

    if (error) throw error;

    const filas = (data || []).map((r) => ({
      FECHA: formatearFecha(r.fecha),
      PRODUCTO: r.productos?.nombre || '',
      CANTIDAD: r.cantidad,
      TIPO: r.tipo.toUpperCase(),
      ASIGNADO_A: r.asignado_a || '',
    }));

    exportarExcel('MOVIMIENTOS_PETRO_ASEO', 'MOVIMIENTOS', filas);
    notifyOk('EXCEL GENERADO.');
  } catch (err) {
    console.error(err);
    notifyError('NO SE PUDO EXPORTAR.');
  }
}