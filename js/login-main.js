/**
 * Entrada de index.html: validación de formulario y login con Supabase Auth.
 */
import { iniciarSesion, obtenerSesion, cargarPerfil } from './auth.js';
import { notifyError } from './utils/notifications.js';
import { esEmailValido } from './utils/validators.js';

/**
 * Si ya hay sesión activa, envía al dashboard.
 */
async function redirigirSiSesionActiva() {
  const session = await obtenerSesion();
  if (session) {
    try {
      await cargarPerfil(session.user.id);
      window.location.href = 'dashboard.html';
    } catch {
      /* perfil pendiente: permanece en login */
    }
  }
}

/**
 * Enlaza el envío del formulario de acceso.
 */
function enlazarFormulario() {
  const form = document.getElementById('form-login');
  const togglePwd = document.getElementById('toggle-password');
  const inputPwd = document.getElementById('password');

  if (togglePwd && inputPwd) {
    togglePwd.addEventListener('click', () => {
      inputPwd.type = inputPwd.type === 'password' ? 'text' : 'password';
      togglePwd.setAttribute('aria-label', inputPwd.type === 'password' ? 'MOSTRAR CONTRASEÑA' : 'OCULTAR CONTRASEÑA');
    });
  }

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const usuario = document.getElementById('usuario')?.value || '';
    const password = document.getElementById('password')?.value || '';

    if (!esEmailValido(usuario)) {
      notifyError('EL USUARIO DEBE SER UN CORREO VÁLIDO (SUPABASE AUTH).');
      return;
    }
    if (!password) {
      notifyError('INGRESE CONTRASEÑA.');
      return;
    }

    try {
      await iniciarSesion(usuario, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      console.error(err);
      notifyError('CREDENCIALES INVÁLIDAS O ERROR DE RED.');
    }
  });
}

redirigirSiSesionActiva().catch(console.error);
enlazarFormulario();
