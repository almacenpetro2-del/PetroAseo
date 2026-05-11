/**
 * Cálculos compartidos: estado de equipos y helpers de fechas (mantenimiento + indicadores).
 */

export function hoyISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function diasDesdeFalla(isoTs) {
  const t = new Date(isoTs).getTime();
  if (Number.isNaN(t)) return 0;
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const d1 = new Date(t);
  d1.setHours(0, 0, 0, 0);
  return Math.round((d0.getTime() - d1.getTime()) / (86400 * 1000));
}

export function ultimoPlanPorEquipo(planes, equipoId) {
  const list = (planes || []).filter((p) => p.equipo_id === equipoId);
  if (!list.length) return null;
  return [...list].sort((a, b) => b.anio * 100 + b.mes - (a.anio * 100 + a.mes))[0];
}

export function actividadesUltimoPlan(equipoId, planes, actividades) {
  const lp = ultimoPlanPorEquipo(planes, equipoId);
  if (!lp) return [];
  return (actividades || []).filter((a) => a.plan_id === lp.id);
}

/**
 * Operativo: sin correctivo Pendiente ni condiciones de mantenimiento.
 * En mantenimiento: En Reparación, Pendiente (≤3 d), actividades vencidas o pendientes con fecha ≤ hoy, En proceso.
 * Fuera de servicio: Pendiente > 3 días.
 * @returns {'operativo'|'mantenimiento'|'fuera'}
 */
export function clasificarEquipoEstado(equipoId, planes, actividades, correctivos) {
  const corr = (correctivos || []).filter((c) => c.equipo_id === equipoId);
  const fuera = corr.some((c) => c.estado === 'Pendiente' && diasDesdeFalla(c.fecha_falla) > 3);
  if (fuera) return 'fuera';
  const pendCorr = corr.some((c) => c.estado === 'Pendiente');
  const enRep = corr.some((c) => c.estado === 'En Reparación');
  const acts = actividadesUltimoPlan(equipoId, planes, actividades);
  const hoy = hoyISO();
  const incompleto = (a) => !['Completado', 'Cancelado'].includes(String(a.estado));
  const vencidaPend = acts.some((a) => incompleto(a) && String(a.fecha_programada) < hoy);
  const actMant = acts.some((a) => {
    const fp = String(a.fecha_programada);
    if (String(a.estado) === 'En Proceso') return true;
    if (String(a.estado) === 'Pendiente' && fp <= hoy) return true;
    return false;
  });
  if (pendCorr || enRep || actMant || vencidaPend) return 'mantenimiento';
  return 'operativo';
}

/** @param {number} anio */
export function mesesDelAnioKeys(anio) {
  const keys = [];
  for (let m = 1; m <= 12; m++) keys.push(`${anio}-${String(m).padStart(2, '0')}`);
  return keys;
}

export const MESES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
