/**
 * Módulo OPERACIONES — pestañas DOCUMENTOS, ACTAS, MANTENIMIENTOS y FLOTA (Supabase + Storage).
 * La compresión automática de archivos antes del upload se aplica en
 * `operaciones/documentos.js`, `operaciones/actas.js` y `utils/file-compress.js`.
 */
import { perfilActual, puedeVerModulo, puedeEditarModulo } from '../auth.js';
import { iniciarPanelDocumentos } from './operaciones/documentos.js';
import { iniciarPanelActas } from './operaciones/actas.js';
import { renderMantenimientos } from './mantenimientos.js';
import { consumirFiltrosMantenimiento } from '../utils/mantenimiento-navegacion.js';
import { iniciarPanelFlota } from './operaciones/flota.js';
import { iniciarPanelProgramacionDescansos } from './operaciones/programacion-descansos.js';

/**
 * Cambia pestaña activa y estilos ARIA asociados.
 * @param {HTMLElement} contenedor Sección módulo
 * @param {'doc'|'actas'|'descansos'|'mant'|'flota'} tab Pestaña destino
 */
function marcarPestañaActiva(contenedor, tab) {
  contenedor.querySelectorAll('[data-op-tab]').forEach((b) => {
    const on = b.getAttribute('data-op-tab') === tab;
    b.classList.toggle('module-tab--active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  contenedor.querySelectorAll('[data-op-panel]').forEach((p) => {
    const id = p.getAttribute('data-op-panel');
    p.classList.toggle('is-hidden', id !== tab);
  });
}

/**
 * Renderiza el módulo completo y precarga submódulos.
 * @param {HTMLElement} contenedor Vista SPA (#spa-view)
 */
export async function renderOperaciones(contenedor) {
  if (!puedeVerModulo(perfilActual.rol, 'operaciones')) {
    contenedor.innerHTML = '<p class="msg-denied">NO AUTORIZADO.</p>';
    return;
  }
  const rol = perfilActual.rol;
  const esRrhh = rol === 'rrhh';
  const puede = puedeEditarModulo(rol, 'operaciones');

  contenedor.innerHTML = `
    <section class="module">
      <h2 class="module__title">&#x2699;&#xFE0F; OPERACIONES</h2>
      <div class="module-tabs" role="tablist" aria-label="SUBMÓDULOS OPERACIONES">
        ${esRrhh ? '' : `
        <button type="button" class="module-tab module-tab--active" role="tab" data-op-tab="doc" aria-selected="true">&#x1F4C4; DOCUMENTOS</button>
        <button type="button" class="module-tab" role="tab" data-op-tab="actas" aria-selected="false">&#x1F4DD; ACTAS</button>`}
        <button type="button" class="module-tab ${esRrhh ? 'module-tab--active' : ''}" role="tab" data-op-tab="descansos" aria-selected="${esRrhh ? 'true' : 'false'}">&#x1F4A4; DESCANSOS</button>
        ${esRrhh ? '' : `
        <button type="button" class="module-tab" role="tab" data-op-tab="mant" aria-selected="false">&#x1F527; MANTENIMIENTOS</button>
        <button type="button" class="module-tab" role="tab" data-op-tab="flota" aria-selected="false">&#x1F69B; FLOTA</button>`}
      </div>
      ${esRrhh ? '' : `
      <div id="op-panel-doc" class="module-tab-panel" role="tabpanel" data-op-panel="doc"></div>
      <div id="op-panel-actas" class="module-tab-panel is-hidden" role="tabpanel" data-op-panel="actas"></div>`}
      <div id="op-panel-descansos" class="module-tab-panel" role="tabpanel" data-op-panel="descansos"></div>
      ${esRrhh ? '' : `
      <div id="op-panel-mant" class="module-tab-panel is-hidden" role="tabpanel" data-op-panel="mant"></div>
      <div id="op-panel-flota" class="module-tab-panel is-hidden" role="tabpanel" data-op-panel="flota"></div>`}
    </section>`;

  const pDesc = /** @type {HTMLElement} */ (contenedor.querySelector('#op-panel-descansos'));

  if (esRrhh) {
    await iniciarPanelProgramacionDescansos(pDesc, false);
    contenedor.querySelectorAll('[data-op-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        marcarPestañaActiva(contenedor, 'descansos');
      });
    });
    return;
  }

  const pDoc = /** @type {HTMLElement} */ (contenedor.querySelector('#op-panel-doc'));
  const pAct = /** @type {HTMLElement} */ (contenedor.querySelector('#op-panel-actas'));
  const pMant = /** @type {HTMLElement} */ (contenedor.querySelector('#op-panel-mant'));
  const pFlota = /** @type {HTMLElement} */ (contenedor.querySelector('#op-panel-flota'));

  await Promise.all([iniciarPanelDocumentos(pDoc, puede), iniciarPanelActas(pAct, puede), iniciarPanelProgramacionDescansos(pDesc, puede)]);

  let mantListo = false;
  const abrirMantenimientos = async (/** @type {Record<string, unknown>|null|undefined} */ filtrosNav) => {
    marcarPestañaActiva(contenedor, 'mant');
    if (!mantListo) {
      await renderMantenimientos(pMant, { puede, filtrosNavegacion: filtrosNav || null });
      mantListo = true;
    } else {
      if (typeof pMant._mantRefresh === 'function') await pMant._mantRefresh();
      if (filtrosNav && typeof pMant._mantAplicarFiltros === 'function') pMant._mantAplicarFiltros(filtrosNav);
    }
  };

  let flotaListo = false;
  const abrirFlota = async () => {
    marcarPestañaActiva(contenedor, 'flota');
    if (!flotaListo) {
      await iniciarPanelFlota(pFlota, puede);
      flotaListo = true;
    } else {
      if (typeof pFlota._flRefresh === 'function') await pFlota._flRefresh();
    }
  };

  contenedor.querySelectorAll('[data-op-tab]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tab = /** @type {'doc'|'actas'|'descansos'|'mant'|'flota'} */ (btn.getAttribute('data-op-tab') || 'doc');
      marcarPestañaActiva(contenedor, tab);
      if (tab === 'mant') {
        await abrirMantenimientos(null);
      } else if (tab === 'flota') {
        await abrirFlota();
      }
    });
  });

  const hash = window.location.hash || '';
  if (hash.includes('mantenimientos')) {
    const filtrosNav = consumirFiltrosMantenimiento();
    await abrirMantenimientos(filtrosNav);
  } else if (hash.includes('flota')) {
    await abrirFlota();
  }

  contenedor._spaCleanup = () => {
    if (typeof pMant._spaCleanup === 'function') {
      try { pMant._spaCleanup(); } catch (e) { console.error(e); }
    }
    if (typeof pFlota._spaCleanup === 'function') {
      try { pFlota._spaCleanup(); } catch (e) { console.error(e); }
    }
  };
}
