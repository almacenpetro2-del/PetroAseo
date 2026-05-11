/**
 * Módulo LOGÍSTICA — pestañas PRODUCTOS, MOVIMIENTOS, HIDROLAVADORAS, EPP / HERRAMIENTAS.
 */
import { perfilActual, puedeVerModulo, puedeEditarModulo } from '../auth.js';
import { iniciarPanelProductos } from './logistica/productos.js';
import { iniciarPanelMovimientos } from './logistica/movimientos.js';
import { iniciarPanelHidrolavadoras } from './logistica/hidrolavadoras.js';
import { iniciarPanelEpp } from './logistica/epp.js';
import { supabase } from '../supabase-client.js';

function escLog(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function fmtFechaLog(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function cargarNotificacionesLog(contenedor, abrirDropdown) {
  try {
    const { data, error } = await supabase
      .from('notificaciones')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) return;

    const todas = data || [];
    const noLeidas = todas.filter((n) => !n.leida);
    const badge = contenedor.querySelector('#log-notif-badge');
    const lista = contenedor.querySelector('#log-notif-list');

    if (badge) {
      badge.textContent = noLeidas.length;
      badge.classList.toggle('is-hidden', noLeidas.length === 0);
    }

    if (abrirDropdown && lista) {
      renderNotificaciones(lista, todas, contenedor);
    }
  } catch (_) {}
}

function renderNotificaciones(lista, notificaciones, contenedor) {
  lista.innerHTML = '';
  if (!notificaciones.length) {
    lista.innerHTML = '<div class="notif-item notif-item--empty">SIN NOTIFICACIONES.</div>';
    return;
  }
  for (const n of notificaciones) {
    const item = document.createElement('div');
    item.className = `notif-item${n.leida ? ' notif-item--leida' : ''}`;
    item.innerHTML = `
      <div class="notif-item-text">${escLog(n.mensaje)}</div>
      <span class="notif-item-fecha">${fmtFechaLog(n.created_at)}</span>
      ${!n.leida ? `<button type="button" class="notif-btn-leer" data-nid="${n.id}">MARCAR LEÍDA</button>` : ''}
    `;
    const btn = item.querySelector('.notif-btn-leer');
    if (btn) {
      btn.addEventListener('click', () => marcarLeida(n.id, contenedor));
    }
    lista.appendChild(item);
  }
}

async function marcarLeida(nid, contenedor) {
  try {
    const { error } = await supabase
      .from('notificaciones')
      .update({ leida: true })
      .eq('id', nid);
    if (error) return;
    cargarNotificacionesLog(contenedor, true);
  } catch (_) {}
}

/**
 * Cambia pestaña activa y estilos ARIA.
 * @param {HTMLElement} contenedor Sección módulo
 * @param {'prod'|'mov'|'hidro'|'epp'} tab Pestaña destino
 */
function marcarPestañaLog(contenedor, tab) {
  contenedor.querySelectorAll('[data-log-tab]').forEach((b) => {
    const on = b.getAttribute('data-log-tab') === tab;
    b.classList.toggle('module-tab--active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  contenedor.querySelectorAll('[data-log-panel]').forEach((p) => {
    const id = p.getAttribute('data-log-panel');
    p.classList.toggle('is-hidden', id !== tab);
  });
}

/**
 * Renderiza el módulo completo y precarga submódulos.
 * @param {HTMLElement} contenedor Vista SPA (#spa-view)
 */
export async function renderLogistica(contenedor) {
  if (!puedeVerModulo(perfilActual.rol, 'logistica')) {
    contenedor.innerHTML = '<p class="msg-denied">NO AUTORIZADO.</p>';
    return;
  }
  const puede = puedeEditarModulo(perfilActual.rol, 'logistica');
  contenedor.innerHTML = `
    <section class="module">
      <div class="module-header-row">
        <h2 class="module__title">&#x1F4E6; LOGÍSTICA</h2>
        <div class="notif-bell-wrap" id="log-notif-wrap">
          <button type="button" class="notif-bell-btn" id="log-notif-bell" title="NOTIFICACIONES">
            &#x1F514;
            <span class="notif-badge is-hidden" id="log-notif-badge">0</span>
          </button>
          <div class="notif-dropdown is-hidden" id="log-notif-dropdown">
            <div class="notif-dropdown-list" id="log-notif-list"></div>
          </div>
        </div>
      </div>
      <div class="module-tabs" role="tablist" aria-label="SUBMÓDULOS LOGÍSTICA">
        <button type="button" class="module-tab module-tab--active" role="tab" data-log-tab="prod" aria-selected="true">&#x1F3F7;&#xFE0F; PRODUCTOS</button>
        <button type="button" class="module-tab" role="tab" data-log-tab="mov" aria-selected="false">&#x1F504; MOVIMIENTOS</button>
        <button type="button" class="module-tab" role="tab" data-log-tab="hidro" aria-selected="false">&#x1F4A6; HIDROLAVADORAS</button>
        <button type="button" class="module-tab" role="tab" data-log-tab="epp" aria-selected="false">&#x1F9E4; EPP / HERRAMIENTAS</button>
      </div>
      <div id="log-panel-prod" class="module-tab-panel" role="tabpanel" data-log-panel="prod"></div>
      <div id="log-panel-mov" class="module-tab-panel is-hidden" role="tabpanel" data-log-panel="mov"></div>
      <div id="log-panel-hidro" class="module-tab-panel is-hidden" role="tabpanel" data-log-panel="hidro"></div>
      <div id="log-panel-epp" class="module-tab-panel is-hidden" role="tabpanel" data-log-panel="epp"></div>
    </section>`;

  const pProd = /** @type {HTMLElement} */ (contenedor.querySelector('#log-panel-prod'));
  const pMov = /** @type {HTMLElement} */ (contenedor.querySelector('#log-panel-mov'));
  const pHidro = /** @type {HTMLElement} */ (contenedor.querySelector('#log-panel-hidro'));
  const pEpp = /** @type {HTMLElement} */ (contenedor.querySelector('#log-panel-epp'));

  await Promise.all([
    iniciarPanelProductos(pProd, puede),
    iniciarPanelMovimientos(pMov, puede),
    iniciarPanelHidrolavadoras(pHidro, puede),
    iniciarPanelEpp(pEpp, puede),
  ]);

  contenedor.querySelectorAll('[data-log-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = /** @type {'prod'|'mov'|'hidro'|'epp'} */ (btn.getAttribute('data-log-tab') || 'prod');
      marcarPestañaLog(contenedor, tab);
    });
  });

  const hash = window.location.hash || '';
  if (hash.includes('movimientos')) {
    marcarPestañaLog(contenedor, 'mov');
  } else if (hash.includes('hidrolavadoras')) {
    marcarPestañaLog(contenedor, 'hidro');
  } else if (hash.includes('epp')) {
    marcarPestañaLog(contenedor, 'epp');
  }

  await cargarNotificacionesLog(contenedor);

  const bell = contenedor.querySelector('#log-notif-bell');
  const dropdown = contenedor.querySelector('#log-notif-dropdown');
  bell?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown?.classList.toggle('is-hidden');
    if (!dropdown?.classList.contains('is-hidden')) {
      cargarNotificacionesLog(contenedor, true);
    }
  });

  const clickFuera = (e) => {
    if (!document.body.contains(contenedor)) {
      document.removeEventListener('click', clickFuera);
      return;
    }
    if (!bell?.contains(e.target) && !dropdown?.contains(e.target)) {
      dropdown?.classList.add('is-hidden');
    }
  };
  document.addEventListener('click', clickFuera);

  contenedor._spaCleanup = () => {
    document.removeEventListener('click', clickFuera);
    [pMov, pHidro, pEpp].forEach((p) => {
      if (typeof p._spaCleanup === 'function') {
        try { p._spaCleanup(); } catch (e) { console.error(e); }
      }
    });
  };
}
