/**
 * Enrutador SPA basado en hash (#/ruta) con protección por rol.
 */
import { puedeVerModulo, perfilActual } from './auth.js';
import { renderUsuarios } from './modules/usuarios.js';
import { renderLogistica } from './modules/logistica.js';
import { renderRrhh } from './modules/rrhh.js';
import { renderOperaciones } from './modules/operaciones.js';
import { renderIndicadores } from './modules/indicadores.js';

/** Mapa ruta -> función render del módulo */
const rutas = {
  '#/usuarios': renderUsuarios,
  '#/logistica': renderLogistica,
  '#/logistica/productos': renderLogistica,
  '#/logistica/movimientos': renderLogistica,
  '#/logistica/hidrolavadoras': renderLogistica,
  '#/logistica/epp': renderLogistica,
  '#/rrhh': renderRrhh,
  '#/operaciones': renderOperaciones,
  '#/operaciones/mantenimientos': renderOperaciones,
  '#/operaciones/flota': renderOperaciones,
  '#/indicadores': renderIndicadores,
};

/**
 * Resuelve hash a función render (subrutas de logistica/operaciones comparten render).
 * @param {string} hash
 */
function obtenerRender(hash) {
  if (rutas[hash]) return rutas[hash];
  if (hash.startsWith('#/logistica/')) return renderLogistica;
  if (hash.startsWith('#/operaciones/')) return renderOperaciones;
  return undefined;
}

/**
 * Resuelve la ruta por defecto según rol del usuario.
 * @param {string} rol Rol actual
 */
export function rutaDefaultPorRol(rol) {
  if (rol === 'admin') return '#/usuarios';
  if (rol === 'logistica') return '#/logistica';
  if (rol === 'rrhh') return '#/rrhh';
  if (rol === 'operaciones') return '#/operaciones';
  return '#/indicadores';
}

/**
 * Verifica acceso a una ruta concreta.
 * @param {string} hash Ruta tipo #/...
 */
export function puedeAccederRuta(hash) {
  if (!perfilActual) return false;
  const rol = perfilActual.rol;
  if (hash.startsWith('#/usuarios')) return puedeVerModulo(rol, 'usuarios');
  if (hash.startsWith('#/logistica')) return puedeVerModulo(rol, 'logistica');
  if (hash.startsWith('#/rrhh')) return puedeVerModulo(rol, 'rrhh');
  if (hash.startsWith('#/operaciones')) return puedeVerModulo(rol, 'operaciones');
  if (hash.startsWith('#/indicadores')) return puedeVerModulo(rol, 'indicadores');
  return false;
}

/**
 * Navega programáticamente actualizando hash.
 * @param {string} hash Destino
 */
export function navegarA(hash) {
  window.location.hash = hash;
}

/**
 * Renderiza el módulo activo dentro del contenedor principal.
 * @param {HTMLElement} contenedor Área #spa-view
 */
export async function resolverVista(contenedor) {
  let hash = window.location.hash || '';
  if (!hash || hash === '#') {
    navegarA(rutaDefaultPorRol(perfilActual.rol));
    return;
  }
  if (!puedeAccederRuta(hash)) {
    navegarA(rutaDefaultPorRol(perfilActual.rol));
    return;
  }
  const render = obtenerRender(hash);
  if (!render) {
    navegarA(rutaDefaultPorRol(perfilActual.rol));
    return;
  }
  if (typeof contenedor._spaCleanup === 'function') {
    try {
      contenedor._spaCleanup();
    } catch (e) {
      console.error(e);
    }
    delete contenedor._spaCleanup;
  }
  contenedor.innerHTML = '<div class="spa-loading">CARGANDO…</div>';
  await render(contenedor);
}

/**
 * Activa listeners de hashchange y primera carga.
 * @param {HTMLElement} contenedor Área principal SPA
 */
export function iniciarRouter(contenedor) {
  window.addEventListener('hashchange', () => {
    resolverVista(contenedor);
  });
  resolverVista(contenedor);
}
