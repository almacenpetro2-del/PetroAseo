/**
 * Submódulo FLOTA — Seguimiento de vehículos (ciclo turno → lavado → mercado).
 * Estado determinado por última secuencia de eventos en flota_eventos.
 */
import { supabase } from '../../supabase-client.js';
import { notifyOk, notifyError } from '../../utils/notifications.js';
import { exportarExcel } from '../../utils/excel.js';

const SECUENCIA = ['inicio_turno', 'salida_mercado', 'llega_lavado', 'salida_lavado', 'llega_mercado'];

const EVENTO_LABEL = {
  inicio_turno:   'Inicio de turno',
  salida_mercado:  'Salida de mercado',
  llega_lavado:    'Llega a lavado',
  salida_lavado:   'Salida de lavado',
  llega_mercado:   'Llega al mercado',
};

const INTERVALO_LABEL = {
  inicio_turno:   'Tiempo en turno',
  salida_mercado:  'Tiempo en ruta de ida',
  llega_lavado:    'Tiempo en lavado',
  salida_lavado:   'Tiempo en ruta de vuelta',
  llega_mercado:   'Tiempo total del ciclo',
};

function esc(t) {
  const d = document.createElement('div');
  d.textContent = t ?? '';
  return d.innerHTML;
}

function fmtHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function fmtFechaHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const anio = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${dia}/${mes}/${anio} ${h}:${m}:${s}`;
}

function fmtSegundos(segundos) {
  if (segundos == null || segundos < 0) return '—';
  const total = Math.round(segundos);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

let _timerInterval = null;
let _timerData = null;

function detenerTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  _timerData = null;
}

/**
 * @param {HTMLElement} host
 * @param {boolean} puedeEditar
 */
export async function iniciarPanelFlota(host, puedeEditar) {
  detenerTimer();
  _timerData = { host, puedeEditar };
  iniciarTimer();

  host.innerHTML = `
    <div class="flota-modulo">
      <h2 class="flota-titulo">SEGUIMIENTO DE FLOTA</h2>
      <div class="flota-reloj" id="flota-reloj">00:00:00</div>
      ${puedeEditar ? `<button type="button" class="btn btn-flota-agregar" id="btn-agregar-carro">AGREGAR CARRO</button>` : ''}
      <div class="flota-vehiculos" id="zona-vehiculos"></div>
      <div class="flota-historial">
        <h3 class="flota-historial__titulo">HISTORIAL DE EVENTOS</h3>
        <div class="flota-filtros">
          <input type="text" id="fl-buscador" class="flota-filtro-input" placeholder="BUSCAR POR PLACA, CHOFER O EVENTO..." />
          <select id="fl-filtro-vehiculo" class="flota-filtro-input"><option value="">TODOS LOS VEHÍCULOS</option></select>
          <input type="date" id="fl-fecha-desde" class="flota-filtro-input" />
          <input type="date" id="fl-fecha-hasta" class="flota-filtro-input" />
          <button type="button" class="btn btn-flota-excel" id="btn-descargar-excel">DESCARGAR EXCEL</button>
        </div>
        <div class="flota-tabla-wrap">
          <table id="tabla-historial" class="flota-tabla">
            <thead><tr>
              <th>HORA</th><th>VEHÍCULO</th><th>CHOFER</th><th>EVENTO</th><th>VIAJE N°</th><th>EMMSA N°</th><th>EMMSA HORA</th><th>EMMSA PESO</th><th>PETROMAS N°</th><th>PETROMAS PESO</th><th>N° GUÍA</th><th>TIKET ENTRADA</th><th>INCIDENCIAS</th><th>TIEMPO DESDE ANTERIOR</th>
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>`;

  host._flRefresh = async () => await cargarYRenderizar(host, puedeEditar);
  host._spaCleanup = detenerTimer;

  if (puedeEditar) {
    host.querySelector('#btn-agregar-carro').addEventListener('click', () => mostrarModalAgregar(host));
  }

  host.querySelector('#fl-buscador').addEventListener('input', () => filtrarHistorial(host));
  host.querySelector('#fl-filtro-vehiculo').addEventListener('change', () => filtrarHistorial(host));
  host.querySelector('#fl-fecha-desde').addEventListener('change', () => filtrarHistorial(host));
  host.querySelector('#fl-fecha-hasta').addEventListener('change', () => filtrarHistorial(host));
  host.querySelector('#btn-descargar-excel').addEventListener('click', () => exportarHistorial(host));

  await cargarYRenderizar(host, puedeEditar);
}

async function cargarYRenderizar(host, puedeEditar) {
  const { data: vehiculos, error: errV } = await supabase
    .from('flota_vehiculos')
    .select('*')
    .order('placa');

  if (errV) { notifyError(errV.message); return; }

  const { data: eventos, error: errE } = await supabase
    .from('flota_eventos')
    .select('*')
    .order('created_at', { ascending: true });

  if (errE) { notifyError(errE.message); return; }

  const vehiculosArr = vehiculos || [];
  const eventosArr = eventos || [];

  const vehiculosMap = {};
  for (const v of vehiculosArr) vehiculosMap[v.id] = v;

  const estadosVehiculos = vehiculosArr.map((v) => computarEstadoVehiculo(v, eventosArr));

  renderizarVehiculos(host.querySelector('#zona-vehiculos'), estadosVehiculos, puedeEditar);
  renderizarSelectFiltro(host.querySelector('#fl-filtro-vehiculo'), vehiculosArr);
  host._eventosCache = eventosArr;
  host._vehiculosMap = vehiculosMap;
  filtrarHistorial(host);
}

function computarEstadoVehiculo(vehiculo, eventos) {
  const propios = eventos.filter((e) => e.vehiculo_id === vehiculo.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (propios.length === 0) {
    return { vehiculo, ultimoEvento: null, viaje: 1, siguienteAccion: 'inicio_turno', eventosCiclo: [], estadoActual: null };
  }

  const ultimo = propios[propios.length - 1];
  const viaje = ultimo.viaje;
  const ciclo = propios.filter((e) => e.viaje === viaje);

  const idx = SECUENCIA.indexOf(ultimo.evento);
  const siguienteAccion = idx < SECUENCIA.length - 1 ? SECUENCIA[idx + 1] : 'inicio_turno';

  const intervalos = [];
  for (let i = 0; i < SECUENCIA.length; i++) {
    const tipo = SECUENCIA[i];
    const ev = ciclo.find((e) => e.evento === tipo);
    if (!ev) break;

    const label = INTERVALO_LABEL[tipo] || tipo;
    const sigEv = SECUENCIA.slice(i + 1).reduce((found, t) => found || ciclo.find((e) => e.evento === t), null);

    if (sigEv) {
      intervalos.push({ label, valor: fmtSegundos(sigEv.tiempo_desde_anterior), corriendo: false });
    } else {
      const desde = new Date(ev.created_at).getTime();
      intervalos.push({ label, valor: '', corriendo: true, desde });
    }
  }

  return { vehiculo, ultimoEvento: ultimo, viaje, siguienteAccion, eventosCiclo: ciclo, estadoActual: ultimo.evento, intervalos };
}

function renderizarVehiculos(zona, estados, puedeEditar) {
  zona.innerHTML = '';
  if (!estados.length) {
    zona.innerHTML = '<p class="flota-vacio">NO HAY VEHÍCULOS REGISTRADOS.</p>';
    return;
  }
  for (const estado of estados) {
    zona.appendChild(crearTarjetaVehiculo(estado, puedeEditar));
  }
}

function crearTarjetaVehiculo(estado, puedeEditar) {
  const card = document.createElement('div');
  card.className = 'flota-vehiculo-card';
  card.setAttribute('data-vehiculo-id', estado.vehiculo.id);

  const botones = SECUENCIA.map((tipo) => {
    const idx = SECUENCIA.indexOf(tipo);
    const actualIdx = estado.ultimoEvento ? SECUENCIA.indexOf(estado.ultimoEvento.evento) : -1;
    let clase = 'flota-btn-estado';
    let disabled = true;
    let label = EVENTO_LABEL[tipo].toUpperCase();
    let estilo = '';

    if (estado.ultimoEvento && estado.ultimoEvento.evento === 'llega_mercado' && tipo === 'inicio_turno') {
      clase += ' flota-btn-estado--habilitado';
      disabled = false;
      estilo = 'background:#1a1a2e;color:#fff;border-color:#1a1a2e;';
    } else if (idx <= actualIdx) {
      clase += ' flota-btn-estado--completado';
      label = `${label} ✓`;
      estilo = 'background:#4CAF50;color:#fff;border-color:#4CAF50;';
    } else if (idx === actualIdx + 1) {
      clase += ' flota-btn-estado--habilitado';
      disabled = false;
      estilo = 'background:#1a1a2e;color:#fff;border-color:#1a1a2e;';
    } else {
      estilo = 'background:#ccc;color:#666;border-color:#aaa;';
    }

    if (!estado.ultimoEvento && tipo === 'inicio_turno') {
      clase += ' flota-btn-estado--habilitado';
      disabled = false;
      estilo = 'background:#1a1a2e;color:#fff;border-color:#1a1a2e;';
    }

    return `<button type="button" class="${clase}" data-tipo="${tipo}" data-vehiculo-id="${estado.vehiculo.id}" ${disabled ? 'disabled' : ''} style="${estilo}">${label}</button>`;
  }).join('');

  const intervalosHTML = (estado.intervalos || []).map((inv) => {
    const val = inv.corriendo ? `<span class="flota-timer flota-timer--activo" data-desde="${inv.desde}">${inv.valor || '0s'}</span>` : esc(inv.valor);
    return `<div class="flota-intervalo"><span class="flota-intervalo__label">${esc(inv.label)}</span><span class="flota-intervalo__valor">${val}</span></div>`;
  }).join('');

  const viajeLabel = estado.viaje && estado.ultimoEvento ? `VIAJE N° ${estado.viaje}` : '';
  const ultimoEventoLabel = estado.estadoActual ? `ÚLTIMO: ${EVENTO_LABEL[estado.estadoActual].toUpperCase()}` : 'SIN INICIAR';

  card.innerHTML = `
    <div class="flota-vehiculo-card__body">
      <div class="flota-vehiculo-card__header">
        <span class="flota-vehiculo-card__placa">${esc(estado.vehiculo.placa)}</span>
        <span class="flota-vehiculo-card__chofer">${esc(estado.vehiculo.chofer)}</span>
        ${puedeEditar ? `<button type="button" class="flota-btn-editar" data-accion="editar-vehiculo" data-vehiculo-id="${estado.vehiculo.id}">&#9998;</button>` : ''}
      </div>
      <div class="flota-vehiculo-card__estado">
        <span class="flota-vehiculo-card__estado-lbl">${ultimoEventoLabel}</span>
        ${viajeLabel ? `<span class="flota-vehiculo-card__viaje">${viajeLabel}</span>` : ''}
      </div>
      <div class="flota-vehiculo-card__intervalos">${intervalosHTML || '<span class="flota-intervalo__vacio">SIN TIEMPOS REGISTRADOS</span>'}</div>
      ${puedeEditar ? `<div class="flota-vehiculo-card__acciones">${botones}</div>
      <div class="flota-vehiculo-card__tickets">
        <div class="flota-tiket-grupo">
          <span class="flota-tiket-label">TIKET EMMSA</span>
          <input type="text" class="flota-tiket-input" id="tiket-emmsa-num-${estado.vehiculo.id}" placeholder="N°" maxlength="50" />
          <input type="text" class="flota-tiket-input" id="tiket-emmsa-hora-${estado.vehiculo.id}" placeholder="HORA" maxlength="20" />
          <input type="text" class="flota-tiket-input" id="tiket-emmsa-peso-${estado.vehiculo.id}" placeholder="PESO" maxlength="20" />
        </div>
        <div class="flota-tiket-grupo">
          <span class="flota-tiket-label">TIKET PETROMAS</span>
          <input type="text" class="flota-tiket-input" id="tiket-petromas-num-${estado.vehiculo.id}" placeholder="N°" maxlength="50" />
          <input type="text" class="flota-tiket-input" id="tiket-petromas-peso-${estado.vehiculo.id}" placeholder="PESO" maxlength="20" />
        </div>
        <div class="flota-tiket-grupo" style="display:flex;gap:0.3rem;">
          <input type="text" class="flota-tiket-input" id="num-guia-${estado.vehiculo.id}" placeholder="N° DE GUÍA" maxlength="50" style="flex:1;" />
          <input type="text" class="flota-tiket-input" id="tiket-entrada-${estado.vehiculo.id}" placeholder="TIKET ENTRADA" maxlength="50" style="flex:1;" />
          <input type="text" class="flota-tiket-input" id="incidencias-${estado.vehiculo.id}" placeholder="INCIDENCIAS" maxlength="200" style="flex:2;" />
        </div>
      </div>` : ''}
    </div>`;

  return card;
}

function mostrarModalAgregar(host) {
  const existe = document.getElementById('flota-modal-overlay');
  if (existe) existe.remove();

  const overlay = document.createElement('div');
  overlay.id = 'flota-modal-overlay';
  overlay.className = 'flota-modal-overlay';
  overlay.innerHTML = `
    <div class="flota-modal">
      <h3 class="flota-modal__titulo">AGREGAR VEHÍCULO</h3>
      <label class="flota-modal__campo">PLACA <input id="fl-modal-placa" class="flota-modal__input input-upper" placeholder="ABC-123" maxlength="20" /></label>
      <label class="flota-modal__campo">CHOFER <input id="fl-modal-chofer" class="flota-modal__input input-upper" placeholder="NOMBRE COMPLETO" maxlength="100" /></label>
      <div class="flota-modal__acciones">
        <button type="button" class="btn btn-flota-agregar" id="btn-modal-guardar">GUARDAR</button>
        <button type="button" class="btn btn-ghost" id="btn-modal-cancelar">CANCELAR</button>
      </div>
      <p class="flota-modal__error" id="fl-modal-error" style="display:none;"></p>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#btn-modal-cancelar').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-modal-guardar').addEventListener('click', async () => {
    const placa = overlay.querySelector('#fl-modal-placa').value.trim().toUpperCase();
    const chofer = overlay.querySelector('#fl-modal-chofer').value.trim().toUpperCase();
    const errEl = overlay.querySelector('#fl-modal-error');

    if (!placa || !chofer) {
      errEl.textContent = 'PLACA Y CHOFER SON OBLIGATORIOS.';
      errEl.style.display = 'block';
      return;
    }

    const { data: existe, error: errCheck } = await supabase.from('flota_vehiculos').select('id').eq('placa', placa).maybeSingle();
    if (errCheck) { notifyError(errCheck.message); return; }
    if (existe) {
      errEl.textContent = 'YA EXISTE UN VEHÍCULO CON ESA PLACA.';
      errEl.style.display = 'block';
      return;
    }

    const { error } = await supabase.from('flota_vehiculos').insert({ placa, chofer });
    if (error) { notifyError(error.message); return; }

    notifyOk(`VEHÍCULO ${placa} AGREGADO.`);
    overlay.remove();
    await cargarYRenderizar(host, _timerData?.puedeEditar ?? false);
  });

  overlay.querySelector('#fl-modal-placa').focus();
}

function mostrarModalEditar(host, vehiculo) {
  const existe = document.getElementById('flota-modal-overlay');
  if (existe) existe.remove();

  const overlay = document.createElement('div');
  overlay.id = 'flota-modal-overlay';
  overlay.className = 'flota-modal-overlay';
  overlay.innerHTML = `
    <div class="flota-modal">
      <h3 class="flota-modal__titulo">CAMBIAR CHOFER</h3>
      <p class="flota-modal__placa-fija">PLACA: <strong>${esc(vehiculo.placa)}</strong></p>
      <label class="flota-modal__campo">CHOFER <input id="fl-modal-chofer" class="flota-modal__input input-upper" value="${esc(vehiculo.chofer)}" maxlength="100" /></label>
      <div class="flota-modal__acciones">
        <button type="button" class="btn btn-flota-agregar" id="btn-modal-guardar">GUARDAR</button>
        <button type="button" class="btn btn-ghost" id="btn-modal-cancelar">CANCELAR</button>
      </div>
      <p class="flota-modal__error" id="fl-modal-error" style="display:none;"></p>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#btn-modal-cancelar').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-modal-guardar').addEventListener('click', async () => {
    const chofer = overlay.querySelector('#fl-modal-chofer').value.trim().toUpperCase();
    const errEl = overlay.querySelector('#fl-modal-error');

    if (!chofer) {
      errEl.textContent = 'EL NOMBRE DEL CHOFER ES OBLIGATORIO.';
      errEl.style.display = 'block';
      return;
    }

    const { error } = await supabase.from('flota_vehiculos').update({ chofer }).eq('id', vehiculo.id);
    if (error) { notifyError(error.message); return; }

    notifyOk(`CHOFER DE ${esc(vehiculo.placa)} ACTUALIZADO A ${chofer}.`);
    overlay.remove();
    await cargarYRenderizar(host, _timerData?.puedeEditar ?? false);
  });

  overlay.querySelector('#fl-modal-chofer').focus();
}

async function onEstadoClick(host, vehiculoId, tipo, tiketEmmsaNum, tiketEmmsaHora, tiketEmmsaPeso, tiketPetromasNum, tiketPetromasPeso, numGuia, incidencias, tiketEntrada) {
  if (!_timerData || !_timerData.puedeEditar) return;

  const ahora = new Date();

  const { data: vehiculo } = await supabase.from('flota_vehiculos').select('placa, chofer').eq('id', vehiculoId).maybeSingle();
  if (!vehiculo) { notifyError('VEHÍCULO NO ENCONTRADO.'); return; }

  const { data: ultimos } = await supabase
    .from('flota_eventos')
    .select('*')
    .eq('vehiculo_id', vehiculoId)
    .order('created_at', { ascending: false })
    .limit(1);

  const ultimo = ultimos && ultimos.length ? ultimos[0] : null;
  let viaje = 1;
  let tiempoAnterior = 0;

  if (ultimo) {
    if (tipo === 'inicio_turno' && ultimo.evento === 'llega_mercado') {
      viaje = ultimo.viaje + 1;
    } else {
      viaje = ultimo.viaje;
    }
    const tAnt = (ahora.getTime() - new Date(ultimo.created_at).getTime()) / 1000;
    tiempoAnterior = Math.max(0, Math.round(tAnt * 10) / 10);
  }

  const { error } = await supabase.from('flota_eventos').insert({
    vehiculo_id: vehiculoId,
    evento: tipo,
    chofer: vehiculo.chofer,
    viaje,
    tiket_emmsa_numero: tiketEmmsaNum || null,
    tiket_emmsa_hora: tiketEmmsaHora || null,
    tiket_emmsa_peso: tiketEmmsaPeso || null,
    tiket_petromas_numero: tiketPetromasNum || null,
    tiket_petromas_peso: tiketPetromasPeso || null,
    numero_guia: numGuia || null,
    incidencias: incidencias || null,
    tiket_entrada: tiketEntrada || null,
    tiempo_desde_anterior: tiempoAnterior,
    created_at: ahora.toISOString(),
  });

  if (error) { notifyError(error.message); return; }

  const card = host.querySelector(`.flota-vehiculo-card[data-vehiculo-id="${vehiculoId}"]`);
  if (card) {
    const campos = ['tiket-emmsa-num', 'tiket-emmsa-hora', 'tiket-emmsa-peso', 'tiket-petromas-num', 'tiket-petromas-peso', 'num-guia', 'incidencias', 'tiket-entrada'];
    for (const c of campos) {
      const inp = card.querySelector(`#${c}-${vehiculoId}`);
      if (inp) inp.value = '';
    }
  }

  notifyOk(`${vehiculo.placa} → ${EVENTO_LABEL[tipo].toUpperCase()}`);
  await cargarYRenderizar(host, _timerData.puedeEditar);
}

function renderizarSelectFiltro(selectEl, vehiculos) {
  const val = selectEl.value;
  selectEl.innerHTML = '<option value="">TODOS LOS VEHÍCULOS</option>';
  for (const v of vehiculos) {
    selectEl.innerHTML += `<option value="${v.id}">${esc(v.placa)} — ${esc(v.chofer)}</option>`;
  }
  selectEl.value = val;
}

function filtrarHistorial(host) {
  const eventos = host._eventosCache || [];
  const vehiculosMap = host._vehiculosMap || {};
  const buscador = (host.querySelector('#fl-buscador')?.value || '').trim().toUpperCase();
  const filtroVehiculo = host.querySelector('#fl-filtro-vehiculo')?.value || '';
  const fechaDesde = host.querySelector('#fl-fecha-desde')?.value || '';
  const fechaHasta = host.querySelector('#fl-fecha-hasta')?.value || '';

  let filtrados = [...eventos].reverse();

  if (filtroVehiculo) {
    filtrados = filtrados.filter((e) => e.vehiculo_id === filtroVehiculo);
  }
  if (fechaDesde) {
    const d = new Date(fechaDesde + 'T00:00:00');
    filtrados = filtrados.filter((e) => new Date(e.created_at) >= d);
  }
  if (fechaHasta) {
    const d = new Date(fechaHasta + 'T23:59:59');
    filtrados = filtrados.filter((e) => new Date(e.created_at) <= d);
  }
  if (buscador) {
    filtrados = filtrados.filter((e) => {
      const v = vehiculosMap[e.vehiculo_id];
      const placa = (v?.placa || '').toUpperCase();
      const chofer = (v?.chofer || '').toUpperCase();
      const evChofer = (e.chofer || '').toUpperCase();
      const evLabel = (EVENTO_LABEL[e.evento] || '').toUpperCase();
      return placa.includes(buscador) || chofer.includes(buscador) || evChofer.includes(buscador) || evLabel.includes(buscador);
    });
  }

  const tbody = host.querySelector('#tabla-historial tbody');
  tbody.innerHTML = '';
  if (!filtrados.length) {
    tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;padding:1.5rem;">SIN EVENTOS REGISTRADOS.</td></tr>';
    return;
  }

  for (const ev of filtrados) {
    const v = vehiculosMap[ev.vehiculo_id];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtFechaHora(ev.created_at)}</td>
      <td>${esc(v?.placa || '—')}</td>
      <td>${esc(ev.chofer || v?.chofer || '—')}</td>
      <td>${esc(EVENTO_LABEL[ev.evento] || ev.evento)}</td>
      <td>${ev.viaje}</td>
      <td>${esc(ev.tiket_emmsa_numero || '—')}</td>
      <td>${esc(ev.tiket_emmsa_hora || '—')}</td>
      <td>${esc(ev.tiket_emmsa_peso || '—')}</td>
      <td>${esc(ev.tiket_petromas_numero || '—')}</td>
      <td>${esc(ev.tiket_petromas_peso || '—')}</td>
      <td>${esc(ev.numero_guia || '—')}</td>
      <td>${esc(ev.tiket_entrada || '—')}</td>
      <td>${esc(ev.incidencias || '—')}</td>
      <td>${fmtSegundos(ev.tiempo_desde_anterior)}</td>`;
    tbody.appendChild(tr);
  }
  host._historialFiltrado = filtrados;
}

function exportarHistorial(host) {
  const filtrados = host._historialFiltrado || [];
  const vehiculosMap = host._vehiculosMap || {};
  const filas = filtrados.map((ev) => {
    const v = vehiculosMap[ev.vehiculo_id];
    return {
      'HORA': fmtFechaHora(ev.created_at),
      'VEHICULO': v?.placa || '',
      'CHOFER': ev.chofer || v?.chofer || '',
      'EVENTO': EVENTO_LABEL[ev.evento] || ev.evento,
      'VIAJE N°': ev.viaje,
      'TIKET EMMSA N°': ev.tiket_emmsa_numero || '',
      'TIKET EMMSA HORA': ev.tiket_emmsa_hora || '',
      'TIKET EMMSA PESO': ev.tiket_emmsa_peso || '',
      'TIKET PETROMAS N°': ev.tiket_petromas_numero || '',
      'TIKET PETROMAS PESO': ev.tiket_petromas_peso || '',
      'N° GUÍA': ev.numero_guia || '',
      'TIKET ENTRADA': ev.tiket_entrada || '',
      'INCIDENCIAS': ev.incidencias || '',
      'TIEMPO DESDE ANTERIOR': fmtSegundos(ev.tiempo_desde_anterior),
    };
  });
  try {
    exportarExcel('historial_flota', 'Historial', filas);
  } catch (err) {
    notifyError('ERROR AL EXPORTAR EXCEL.');
    console.error(err);
  }
}

function actualizarReloj() {
  const el = document.getElementById('flota-reloj');
  if (!el) return;
  const ahora = new Date();
  const h = String(ahora.getHours()).padStart(2, '0');
  const m = String(ahora.getMinutes()).padStart(2, '0');
  const s = String(ahora.getSeconds()).padStart(2, '0');
  el.textContent = `${h}:${m}:${s}`;
}

function actualizarTemporizadores() {
  const ahora = Date.now();
  document.querySelectorAll('.flota-timer--activo').forEach((el) => {
    const desde = parseInt(el.getAttribute('data-desde'), 10);
    if (!desde) return;
    const seg = Math.max(0, Math.round((ahora - desde) / 1000));
    el.textContent = fmtSegundos(seg);
  });
}

function iniciarTimer() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  actualizarReloj();
  _timerInterval = setInterval(() => {
    actualizarReloj();
    actualizarTemporizadores();
  }, 1000);
}

document.addEventListener('click', (e) => {
  const btnEditar = e.target.closest('.flota-btn-editar');
  if (btnEditar) {
    const vehiculoId = btnEditar.getAttribute('data-vehiculo-id');
    const host = document.getElementById('op-panel-flota');
    if (!host || !host._vehiculosMap) return;
    const vehiculo = host._vehiculosMap[vehiculoId];
    if (vehiculo) mostrarModalEditar(host, vehiculo);
    return;
  }

  const btn = e.target.closest('.flota-btn-estado--habilitado');
  if (!btn) return;
  const tipo = btn.getAttribute('data-tipo');
  const vehiculoId = btn.getAttribute('data-vehiculo-id');
  if (!tipo || !vehiculoId) return;

  const card = btn.closest('.flota-vehiculo-card');
  const tiketEmmsaNum = (card?.querySelector(`#tiket-emmsa-num-${vehiculoId}`)?.value || '').trim();
  const tiketEmmsaHora = (card?.querySelector(`#tiket-emmsa-hora-${vehiculoId}`)?.value || '').trim();
  const tiketEmmsaPeso = (card?.querySelector(`#tiket-emmsa-peso-${vehiculoId}`)?.value || '').trim();
  const tiketPetromasNum = (card?.querySelector(`#tiket-petromas-num-${vehiculoId}`)?.value || '').trim();
  const tiketPetromasPeso = (card?.querySelector(`#tiket-petromas-peso-${vehiculoId}`)?.value || '').trim();
  const numGuia = (card?.querySelector(`#num-guia-${vehiculoId}`)?.value || '').trim();
  const incidencias = (card?.querySelector(`#incidencias-${vehiculoId}`)?.value || '').trim();
  const tiketEntrada = (card?.querySelector(`#tiket-entrada-${vehiculoId}`)?.value || '').trim();

  if (tipo === 'llega_mercado') {
    if (!tiketEmmsaNum || !tiketEmmsaHora || !tiketEmmsaPeso || !tiketPetromasNum || !tiketPetromasPeso) {
      notifyError('DEBE COMPLETAR TODOS LOS CAMPOS DE TIKET (EMMSA Y PETROMAS) PARA LLEGA AL MERCADO.');
      return;
    }
  }

  const host = document.getElementById('op-panel-flota');
  if (!host) return;
  onEstadoClick(host, vehiculoId, tipo, tiketEmmsaNum, tiketEmmsaHora, tiketEmmsaPeso, tiketPetromasNum, tiketPetromasPeso, numGuia, incidencias, tiketEntrada);
});
