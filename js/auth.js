/**
 * Capa de autenticación con Supabase Auth y perfil en tabla public.usuarios.
 */
import { supabase } from './supabase-client.js';

/** Perfil del usuario actual en memoria (nombre, usuario, rol, id) */
export let perfilActual = null;

/**
 * Reinicia la referencia de perfil en memoria (logout o error).
 */
export function limpiarPerfil() {
  perfilActual = null;
}

/**
 * Determina si el rol puede ver un módulo del menú.
 * @param {string} rol Rol normalizado (admin|rrhh|logistica|operaciones)
 * @param {string} moduloId Identificador interno del módulo
 */
export function puedeVerModulo(rol, moduloId) {
  if (rol === 'admin') return true;
  const mapa = {
    usuarios: ['admin'],
    logistica: ['admin', 'logistica'],
    rrhh: ['admin', 'rrhh', 'operaciones'],
    operaciones: ['admin', 'operaciones', 'logistica', 'rrhh'],
    indicadores: ['admin', 'rrhh', 'logistica', 'operaciones'],
  };
  return (mapa[moduloId] || []).includes(rol);
}

/**
 * Indica si el rol puede crear/editar/eliminar en el módulo indicado.
 * Reglas: cada rol con acceso a su módulo tiene CRUD; indicadores solo lectura/análisis (sin persistencia aquí).
 * @param {string} rol Rol actual
 * @param {string} moduloId Módulo
 */
export function puedeEditarModulo(rol, moduloId) {
  if (moduloId === 'indicadores') return true;
  if (moduloId === 'operaciones') return rol === 'admin' || rol === 'operaciones';
  return puedeVerModulo(rol, moduloId);
}

/**
 * Obtiene la sesión actual de Supabase Auth.
 */
export async function obtenerSesion() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * Carga el perfil desde public.usuarios para el usuario autenticado.
 * @param {string} userId UUID de auth.users
 */
export async function cargarPerfil(userId) {
  const { data, error } = await supabase.from('usuarios').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error('PERFIL_NO_ENCONTRADO');
  }
  perfilActual = {
    id: data.id,
    nombre: data.nombre,
    usuario: data.usuario,
    rol: data.rol,
  };
  return perfilActual;
}

/**
 * Inicia sesión con email (campo usuario) y contraseña.
 * @param {string} usuarioEmail Email registrado
 * @param {string} contraseña Contraseña
 */
export async function iniciarSesion(usuarioEmail, contraseña) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usuarioEmail.trim().toLowerCase(),
    password: contraseña.trim(),
  });
  if (error) throw error;
  await cargarPerfil(data.user.id);
  return perfilActual;
}

/**
 * Cierra sesión en Supabase y limpia perfil local.
 */
export async function cerrarSesion() {
  await supabase.auth.signOut();
  limpiarPerfil();
}

/**
 * Registra un nuevo usuario en Auth y crea fila en public.usuarios (solo uso desde módulo admin).
 * Requiere confirmación de email desactivada o flujo válido en el proyecto.
 * @param {object} payload Datos del formulario
 */
export async function registrarUsuarioAuth(payload) {
  const { nombre, usuario, contraseña, rol } = payload;
  const { data, error } = await supabase.auth.signUp({
    email: usuario.trim(),
    password: contraseña,
    options: {
      data: { nombre, rol },
    },
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error('REGISTRO_SIN_USUARIO');

  const { error: insErr } = await supabase.from('usuarios').insert({
    id: user.id,
    nombre: nombre.trim(),
    usuario: usuario.trim(),
    rol,
    contraseña: null,
  });
  if (insErr) throw insErr;
  return user.id;
}

/**
 * Actualiza nombre y rol en public.usuarios.
 * @param {string} id UUID usuario
 * @param {object} campos { nombre, rol }
 */
export async function actualizarPerfilTabla(id, campos) {
  const { error } = await supabase.from('usuarios').update(campos).eq('id', id);
  if (error) throw error;
}

/**
 * Elimina fila de public.usuarios (no borra auth.users desde el cliente).
 * @param {string} id UUID
 */
export async function eliminarPerfilTabla(id) {
  const { error } = await supabase.from('usuarios').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Actualiza la contraseña del usuario autenticado actual (autosericio).
 * @param {string} nueva Nueva contraseña
 */
export async function actualizarMiContraseña(nueva) {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) throw error;
}

/**
 * Escucha cambios de sesión (logout en otra pestaña, refresh token, etc.).
 * @param {(session: import('@supabase/supabase-js').Session|null) => void} callback
 */
export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
