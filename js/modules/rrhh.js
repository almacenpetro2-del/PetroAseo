/**
 * Módulo RECURSOS HUMANOS — pestañas PERSONAL ACTIVO, CESADO, VACACIONES, INCIDENCIAS y DESCANSOS MÉDICOS.
 */
import { perfilActual, puedeVerModulo, puedeEditarModulo } from '../auth.js';
import { iniciarPanelPersonalActivo } from './rrhh/personal-activo.js';
import { iniciarPanelPersonalCesado } from './rrhh/personal-cesado.js';
import { iniciarPanelAsistencia } from './rrhh/asistencia.js';
import { iniciarPanelVacaciones } from './vacaciones.js';
import { iniciarPanelIncidencias } from './incidencias.js';
import { iniciarPanelDescansosMedicos } from './descansos_medicos.js';

/**
 * Actualiza estilos de pestañas RRHH.
 * @param {HTMLElement} contenedor Módulo
 * @param {'activo'|'cesado'|'asistencia'|'vacaciones'|'incidencias'|'descansos'} tab Id pestaña
 */
function marcarPestañaRrhh(contenedor, tab) {
  contenedor.querySelectorAll('[data-rrhh-tab]').forEach((b) => {
    const on = b.getAttribute('data-rrhh-tab') === tab;
    b.classList.toggle('module-tab--active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const p1 = contenedor.querySelector('#rrhh-panel-activo');
  const p2 = contenedor.querySelector('#rrhh-panel-cesado');
  const p3 = contenedor.querySelector('#rrhh-panel-asistencia');
  const p4 = contenedor.querySelector('#rrhh-panel-vacaciones');
  const p5 = contenedor.querySelector('#rrhh-panel-incidencias');
  const p6 = contenedor.querySelector('#rrhh-panel-descansos');
  if (p1 && p2 && p3 && p4 && p5 && p6) {
    p1.classList.toggle('is-hidden', tab !== 'activo');
    p2.classList.toggle('is-hidden', tab !== 'cesado');
    p3.classList.toggle('is-hidden', tab !== 'asistencia');
    p4.classList.toggle('is-hidden', tab !== 'vacaciones');
    p5.classList.toggle('is-hidden', tab !== 'incidencias');
    p6.classList.toggle('is-hidden', tab !== 'descansos');
  }
}

/**
 * Renderiza módulo RRHH con subpaneles.
 * @param {HTMLElement} contenedor Vista SPA
 */
export async function renderRrhh(contenedor) {
  if (!puedeVerModulo(perfilActual.rol, 'rrhh')) {
    contenedor.innerHTML = '<p class="msg-denied">NO AUTORIZADO.</p>';
    return;
  }
  const rol = perfilActual.rol;
  const esOperaciones = rol === 'operaciones';
  const puede = puedeEditarModulo(rol, 'rrhh') || esOperaciones;

  contenedor.innerHTML = `
    <section class="module">
      <h2 class="module__title">&#x1F465; RECURSOS HUMANOS</h2>
      <div class="module-tabs" role="tablist" aria-label="SUBMÓDULOS RRHH">
        ${esOperaciones ? '' : `
        <button type="button" class="module-tab module-tab--active" role="tab" data-rrhh-tab="activo" aria-selected="true">&#x1F464; PERSONAL ACTIVO</button>
        <button type="button" class="module-tab" role="tab" data-rrhh-tab="cesado" aria-selected="false">&#x1F6AB; PERSONAL CESADO</button>`}
        <button type="button" class="module-tab ${esOperaciones ? 'module-tab--active' : ''}" role="tab" data-rrhh-tab="asistencia" aria-selected="${esOperaciones ? 'true' : 'false'}">&#x2705; ASISTENCIA</button>
        ${esOperaciones ? '' : `
        <button type="button" class="module-tab" role="tab" data-rrhh-tab="vacaciones" aria-selected="false">&#x1F3D6;&#xFE0F; VACACIONES</button>
        <button type="button" class="module-tab" role="tab" data-rrhh-tab="incidencias" aria-selected="false">&#x26A0;&#xFE0F; INCIDENCIAS</button>
        <button type="button" class="module-tab" role="tab" data-rrhh-tab="descansos" aria-selected="false">&#x1F3E5; DESCANSOS MÉDICOS</button>`}
      </div>
      ${esOperaciones ? '' : `
      <div id="rrhh-panel-activo" class="module-tab-panel" role="tabpanel"></div>
      <div id="rrhh-panel-cesado" class="module-tab-panel is-hidden" role="tabpanel"></div>`}
      <div id="rrhh-panel-asistencia" class="module-tab-panel" role="tabpanel"></div>
      ${esOperaciones ? '' : `
      <div id="rrhh-panel-vacaciones" class="module-tab-panel is-hidden" role="tabpanel"></div>
      <div id="rrhh-panel-incidencias" class="module-tab-panel is-hidden" role="tabpanel"></div>
      <div id="rrhh-panel-descansos" class="module-tab-panel is-hidden" role="tabpanel"></div>`}
    </section>`;

  const pAsis = /** @type {HTMLElement} */ (contenedor.querySelector('#rrhh-panel-asistencia'));

  if (esOperaciones) {
    await iniciarPanelAsistencia(pAsis, true);
    contenedor.querySelectorAll('[data-rrhh-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        marcarPestañaRrhh(contenedor, 'asistencia');
      });
    });
    return;
  }

  const pAct = /** @type {HTMLElement} */ (contenedor.querySelector('#rrhh-panel-activo'));
  const pCes = /** @type {HTMLElement} */ (contenedor.querySelector('#rrhh-panel-cesado'));
  const pVac = /** @type {HTMLElement} */ (contenedor.querySelector('#rrhh-panel-vacaciones'));
  const pInc = /** @type {HTMLElement} */ (contenedor.querySelector('#rrhh-panel-incidencias'));
  const pDes = /** @type {HTMLElement} */ (contenedor.querySelector('#rrhh-panel-descansos'));

  await Promise.all([
    iniciarPanelPersonalActivo(pAct, puede),
    iniciarPanelPersonalCesado(pCes, puede),
    iniciarPanelAsistencia(pAsis, puede),
    iniciarPanelVacaciones(pVac, puede),
    iniciarPanelIncidencias(pInc, puede),
    iniciarPanelDescansosMedicos(pDes, puede),
  ]);

  contenedor.querySelectorAll('[data-rrhh-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = /** @type {'activo'|'cesado'|'asistencia'|'vacaciones'|'incidencias'|'descansos'} */ (btn.getAttribute('data-rrhh-tab') || 'activo');
      marcarPestañaRrhh(contenedor, tab);
    });
  });
}
