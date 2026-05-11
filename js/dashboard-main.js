/**
 * Punto de entrada del panel principal (dashboard.html).
 * Verifica sesión, aplica menú por rol y arranca el router SPA.
 */
import { APP_VERSION } from './config.js';
import {
  obtenerSesion,
  cargarPerfil,
  cerrarSesion,
  perfilActual,
  limpiarPerfil,
  puedeVerModulo,
  onAuthChange,
} from './auth.js';
import { iniciarRouter, rutaDefaultPorRol, navegarA } from './router.js';
import { notifyError } from './utils/notifications.js';

/**
 * Redirige al login si no hay sesión válida.
 */
function irAlLogin() {
  window.location.href = 'index.html';
}

/**
 * Muestra u oculta ítems del sidebar según rol.
 */
function aplicarMenuPorRol() {
  const rol = perfilActual.rol;
  document.querySelectorAll('[data-module]').forEach((el) => {
    const mod = el.getAttribute('data-module');
    const ok = puedeVerModulo(rol, mod);
    el.classList.toggle('nav-hidden', !ok);
  });
}

/**
 * Actualiza textos de cabecera con datos del usuario.
 */
function pintarCabecera() {
  const userEl = document.getElementById('header-user-name');
  if (userEl) {
    userEl.textContent = `${perfilActual.nombre} (${perfilActual.rol.toUpperCase()})`;
  }
  document.querySelectorAll('.js-app-version').forEach((el) => {
    el.textContent = `VERSIÓN ${APP_VERSION}`;
  });
}

/**
 * Configura botón cerrar sesión y menú móvil.
 */
function enlazarControlesShell() {
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      await cerrarSesion();
      irAlLogin();
    });
  }
  const btnToggle = document.getElementById('btn-sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (btnToggle && sidebar) {
    btnToggle.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar--open');
    });
  }
  document.querySelectorAll('#sidebar a[data-hash]').forEach((a) => {
    a.addEventListener('click', () => {
      sidebar?.classList.remove('sidebar--open');
    });
  });
}

/**
 * Arranca la aplicación tras validar sesión y perfil.
 */
async function bootstrap() {
  const session = await obtenerSesion();
  if (!session) {
    irAlLogin();
    return;
  }
  try {
    await cargarPerfil(session.user.id);
  } catch (e) {
    console.error(e);
    notifyError('NO SE ENCONTRÓ PERFIL DE USUARIO. CONTACTE AL ADMINISTRADOR.');
    limpiarPerfil();
    await cerrarSesion();
    irAlLogin();
    return;
  }

  aplicarMenuPorRol();
  pintarCabecera();
  enlazarControlesShell();

  const spaView = document.getElementById('spa-view');
  if (!spaView) {
    console.error('Falta #spa-view');
    return;
  }

  if (!window.location.hash || window.location.hash === '#') {
    navegarA(rutaDefaultPorRol(perfilActual.rol));
  }

  iniciarRouter(spaView);

  onAuthChange(async (sessionNext) => {
    if (!sessionNext) {
      limpiarPerfil();
      irAlLogin();
    }
  });
}

bootstrap().catch((err) => {
  console.error(err);
  notifyError('ERROR AL INICIAR EL PANEL.');
});
