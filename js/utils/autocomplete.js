/**
 * Autocompletado vanilla: dropdown bajo el input, filtro parcial sin distinguir mayúsculas,
 * Enter/click para elegir, Escape cierra, flechas arriba/abajo.
 */

/**
 * Normaliza texto para comparación.
 * @param {string} s Cadena
 * @returns {string} Minúsculas recortadas
 */
function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Acopla sugerencias a un input de texto.
 * @param {HTMLInputElement} input Campo controlado
 * @param {object} options Opciones
 * @param {() => Promise<string[]>} options.loadValues Devuelve valores únicos (orden libre)
 * @param {number} [options.maxItems=60] Máximo de filas en el dropdown
 * @returns {{ destroy: () => void, refresh: () => Promise<void> }}
 */
export function attachAutocomplete(input, options) {
  const { loadValues, maxItems = 60 } = options;
  if (!input || input.tagName !== 'INPUT') {
    return {
      destroy() {},
      async refresh() {},
    };
  }

  let destroyed = false;
  const ctl = new AbortController();
  const { signal } = ctl;

  const host = input.parentElement;
  const prevPos = host ? host.style.position : '';
  let hostTouched = false;
  if (host && getComputedStyle(host).position === 'static') {
    host.style.position = 'relative';
    hostTouched = true;
  }
  if (host) host.classList.add('ac-host');

  const ul = document.createElement('ul');
  ul.className = 'ac-dropdown';
  ul.hidden = true;
  ul.setAttribute('role', 'listbox');
  if (host) host.appendChild(ul);

  /** @type {string[]} */
  let allValues = [];
  let open = false;
  let highlighted = -1;
  /** @type {string[]} */
  let filtered = [];

  /**
   * Recarga valores desde loadValues().
   */
  async function refresh() {
    try {
      const raw = await loadValues();
      allValues = [...new Set((raw || []).map((v) => String(v).trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' }),
      );
    } catch {
      allValues = [];
    }
  }

  /**
   * Filtra por subcadena insensible a mayúsculas.
   * @param {string} q Texto del input
   * @returns {string[]} Coincidencias
   */
  function filt(q) {
    const t = norm(q);
    if (!t) return [];
    return allValues.filter((v) => norm(v).includes(t)).slice(0, maxItems);
  }

  /**
   * Cierra el listado sin aplicar selección.
   */
  function close() {
    open = false;
    highlighted = -1;
    ul.hidden = true;
  }

  /**
   * Aplica valor al input y dispara eventos nativos.
   * @param {string} val Valor elegido
   */
  function selectValue(val) {
    input.value = val;
    close();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Pinta ítems y resalta el índice activo.
   */
  function renderList() {
    ul.innerHTML = '';
    if (!open || !filtered.length) {
      ul.hidden = true;
      return;
    }
    filtered.forEach((val, i) => {
      const li = document.createElement('li');
      li.className = 'ac-dropdown__item';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', i === highlighted ? 'true' : 'false');
      if (i === highlighted) li.classList.add('ac-dropdown__item--active');
      li.textContent = String(val).toUpperCase();
      li.addEventListener(
        'mousedown',
        (e) => {
          e.preventDefault();
          selectValue(val);
        },
        { signal },
      );
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  /**
   * Recalcula coincidencias a partir del valor actual del input.
   */
  function syncFiltered() {
    filtered = filt(input.value);
    if (highlighted >= filtered.length) highlighted = filtered.length ? filtered.length - 1 : -1;
    if (highlighted < 0 && filtered.length) highlighted = 0;
  }

  /**
   * Abre lista si hay coincidencias.
   */
  function openFromInput() {
    syncFiltered();
    if (!filtered.length) {
      close();
      return;
    }
    open = true;
    if (highlighted < 0 || highlighted >= filtered.length) highlighted = 0;
    renderList();
  }

  input.addEventListener(
    'input',
    async () => {
      if (!allValues.length) await refresh();
      open = true;
      syncFiltered();
      renderList();
    },
    { signal },
  );

  input.addEventListener(
    'focus',
    async () => {
      if (!allValues.length) await refresh();
      open = true;
      syncFiltered();
      renderList();
    },
    { signal },
  );

  input.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'Enter') {
        if (open && highlighted >= 0 && filtered[highlighted] !== undefined) {
          e.preventDefault();
          selectValue(filtered[highlighted]);
        }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!allValues.length) return;
        filtered = filt(input.value);
        if (!filtered.length) {
          close();
          return;
        }
        e.preventDefault();
        open = true;
        if (e.key === 'ArrowDown') {
          highlighted = highlighted < 0 ? 0 : Math.min(filtered.length - 1, highlighted + 1);
        } else {
          highlighted = highlighted < 0 ? filtered.length - 1 : Math.max(0, highlighted - 1);
        }
        renderList();
        const active = ul.querySelector('.ac-dropdown__item--active');
        if (active && typeof active.scrollIntoView === 'function') {
          active.scrollIntoView({ block: 'nearest' });
        }
      }
    },
    { signal },
  );

  /**
   * Cierra al pulsar fuera del host.
   * @param {MouseEvent} ev Evento
   */
  function onDocPointerDown(ev) {
    if (!host || !host.contains(ev.target)) close();
  }

  document.addEventListener('pointerdown', onDocPointerDown, { capture: true, signal });

  void refresh();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ctl.abort();
      ul.remove();
      if (host) {
        host.classList.remove('ac-host');
        if (hostTouched) host.style.position = prevPos || '';
      }
    },
    refresh,
  };
}
