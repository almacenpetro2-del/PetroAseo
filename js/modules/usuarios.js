/**
 * Módulo USUARIOS — CRUD solo administrador (tabla public.usuarios + Auth en alta).
 */
import { supabase } from '../supabase-client.js';
import { perfilActual, puedeVerModulo, registrarUsuarioAuth, actualizarPerfilTabla, eliminarPerfilTabla } from '../auth.js';
import { notifyOk, notifyError } from '../utils/notifications.js';
import { esEmailValido } from '../utils/validators.js';

const ROLES = [
  { value: 'admin', label: 'ADMINISTRADOR' },
  { value: 'rrhh', label: 'RECURSOS HUMANOS' },
  { value: 'logistica', label: 'LOGÍSTICA' },
  { value: 'operaciones', label: 'OPERACIONES' },
];

/**
 * Renderiza la vista completa del módulo en el contenedor SPA.
 * @param {HTMLElement} contenedor Nodo principal #spa-view
 */
export async function renderUsuarios(contenedor) {
  if (!puedeVerModulo(perfilActual.rol, 'usuarios')) {
    contenedor.innerHTML = '<p class="msg-denied">NO AUTORIZADO.</p>';
    return;
  }

  contenedor.innerHTML = `
    <section class="module">
      <h2 class="module__title">&#x1F464; USUARIOS</h2>
      <form id="form-usuario" class="form-grid card">
        <input type="hidden" id="u-id" />
        <label>NOMBRE<input id="u-nombre" class="input-upper" required maxlength="120" /></label>
        <label>USUARIO (EMAIL)<input id="u-usuario" class="input-upper" required maxlength="120" /></label>
        <label id="lbl-pass">CONTRASEÑA<input id="u-pass" type="password" autocomplete="new-password" /></label>
        <label>ROL<select id="u-rol" class="input-upper"></select></label>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="btn-guardar-usuario">GUARDAR</button>
          <button type="button" class="btn btn-ghost" id="btn-cancelar-edicion">CANCELAR</button>
        </div>
      </form>
      <div class="card table-wrap">
        <table class="data-table" id="tabla-usuarios">
          <thead><tr><th>NOMBRE</th><th>USUARIO</th><th>ROL</th><th>ACCIONES</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <p class="hint">NOTA: ELIMINAR AQUÍ SOLO QUITA EL PERFIL EN BASE; EL USUARIO PUEDE SEGUIR EN AUTHENTICATION HASTA QUE UN ADMIN LO ELIMINE DESDE SUPABASE.</p>
    </section>
  `;

  const sel = contenedor.querySelector('#u-rol');
  ROLES.forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r.value;
    opt.textContent = r.label;
    sel.appendChild(opt);
  });

  const form = contenedor.querySelector('#form-usuario');
  form.addEventListener('submit', onSubmitUsuario);
  contenedor.querySelector('#btn-cancelar-edicion').addEventListener('click', () => resetFormUsuario(contenedor));

  await refrescarTablaUsuarios(contenedor);
}

/**
 * Inserta filas en la tabla HTML desde Supabase.
 * @param {HTMLElement} root Contenedor del módulo
 */
async function refrescarTablaUsuarios(root) {
  const tbody = root.querySelector('#tabla-usuarios tbody');
  tbody.innerHTML = '';
  const { data, error } = await supabase.from('usuarios').select('id,nombre,usuario,rol,created_at').order('created_at', { ascending: false });
  if (error) {
    notifyError(error.message);
    return;
  }
  for (const row of data || []) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(row.nombre)}</td>
      <td>${escapeHtml(row.usuario)}</td>
      <td>${escapeHtml(row.rol.toUpperCase())}</td>
      <td class="table-actions">
        <button type="button" class="btn btn-sm" data-act="edit" data-id="${row.id}">EDITAR</button>
        <button type="button" class="btn btn-sm btn-danger" data-act="del" data-id="${row.id}">ELIMINAR</button>
      </td>`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('button[data-act="edit"]').forEach((btn) =>
    btn.addEventListener('click', () => cargarEdicionUsuario(root, btn.getAttribute('data-id')))
  );
  tbody.querySelectorAll('button[data-act="del"]').forEach((btn) =>
    btn.addEventListener('click', () => borrarUsuario(root, btn.getAttribute('data-id')))
  );
}

/**
 * Escapa texto para insertar en HTML.
 * @param {string} text Texto crudo
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

/**
 * Limpia el formulario para un nuevo registro.
 * @param {HTMLElement} root Raíz del módulo
 */
function resetFormUsuario(root) {
  root.querySelector('#u-id').value = '';
  root.querySelector('#u-nombre').value = '';
  root.querySelector('#u-usuario').value = '';
  root.querySelector('#u-pass').value = '';
  root.querySelector('#u-usuario').removeAttribute('readonly');
  root.querySelector('#lbl-pass').style.display = '';
}

/**
 * Carga datos de un usuario para edición (sin cambiar email obligatorio).
 * @param {HTMLElement} root Raíz
 * @param {string} id UUID
 */
async function cargarEdicionUsuario(root, id) {
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    notifyError('NO SE PUDO CARGAR EL USUARIO.');
    return;
  }
  root.querySelector('#u-id').value = data.id;
  root.querySelector('#u-nombre').value = data.nombre;
  root.querySelector('#u-usuario').value = data.usuario;
  root.querySelector('#u-usuario').setAttribute('readonly', 'readonly');
  root.querySelector('#u-rol').value = data.rol;
  root.querySelector('#u-pass').value = '';
  root.querySelector('#lbl-pass').style.display = '';
}

/**
 * Procesa alta o edición desde el formulario.
 * @param {SubmitEvent} ev Evento submit
 */
async function onSubmitUsuario(ev) {
  ev.preventDefault();
  const root = ev.target.closest('.module');
  const id = root.querySelector('#u-id').value;
  const nombre = root.querySelector('#u-nombre').value.trim();
  const usuario = root.querySelector('#u-usuario').value.trim();
  const pass = root.querySelector('#u-pass').value;
  const rol = root.querySelector('#u-rol').value;

  if (!nombre || !usuario || !rol) {
    notifyError('COMPLETE LOS CAMPOS OBLIGATORIOS.');
    return;
  }

  try {
    if (!id) {
      if (!esEmailValido(usuario)) {
        notifyError('EL USUARIO DEBE SER EMAIL VÁLIDO.');
        return;
      }
      if (!pass || pass.length < 6) {
        notifyError('CONTRASEÑA MÍNIMA 6 CARACTERES.');
        return;
      }
      await registrarUsuarioAuth({ nombre, usuario, contraseña: pass, rol });
      notifyOk('USUARIO CREADO.');
      resetFormUsuario(root);
    } else {
      await actualizarPerfilTabla(id, { nombre, rol });
      if (pass && pass.length >= 6) {
        /* Contraseña de otros usuarios: usar Admin API o flujo de recuperación desde Supabase. */
      }
      notifyOk('USUARIO ACTUALIZADO.');
      resetFormUsuario(root);
    }
    await refrescarTablaUsuarios(root);
  } catch (err) {
    console.error(err);
    notifyError(err.message || 'ERROR AL GUARDAR USUARIO.');
  }
}

/**
 * Elimina usuario tras confirmación.
 * @param {HTMLElement} root Raíz módulo
 * @param {string} id UUID
 */
async function borrarUsuario(root, id) {
  if (!window.confirm('¿CONFIRMAR ELIMINACIÓN DEL PERFIL DE USUARIO?')) return;
  if (id === perfilActual.id) {
    notifyError('NO PUEDE ELIMINARSE A SÍ MISMO DESDE AQUÍ.');
    return;
  }
  try {
    await eliminarPerfilTabla(id);
    notifyOk('USUARIO ELIMINADO DE LA TABLA.');
    await refrescarTablaUsuarios(root);
  } catch (err) {
    console.error(err);
    notifyError(err.message || 'ERROR AL ELIMINAR.');
  }
}
