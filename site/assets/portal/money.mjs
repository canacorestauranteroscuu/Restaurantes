// Misma regla que private.calcular_monto_esperado. El servidor sigue siendo la cifra que vale.

export function round2(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100)) / 100;
}

export function yearOf(isoDate) {
  return Number(String(isoDate).slice(0, 4));
}

export function monthOf(isoDate) {
  return Number(String(isoDate).slice(5, 7));
}

export function hoyChihuahua(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chihuahua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function aniosPermitidos(fecha) {
  const y = yearOf(fecha);
  return [y, y + 1].filter((anio) => anio >= 2026 && anio <= 2036);
}

export function anioSugerido(fecha) {
  const opts = aniosPermitidos(fecha);
  const y = yearOf(fecha);
  if (monthOf(fecha) >= 11 && opts.includes(y + 1)) return y + 1;
  return opts.includes(y) ? y : opts[0];
}

export function tipoMembresia({ esSocioBase, anio, membresias = [], renovaciones = [] }) {
  if (esSocioBase) return 'renovacion';
  const year = Number(anio);
  const conHistorial = membresias.some(
    (m) => Number(m.anio) < year && (m.estado === 'activa' || m.estado === 'vencida')
  );
  const conAprobada = renovaciones.some(
    (r) => Number(r.anio) < year && r.estado === 'aprobada'
  );
  return conHistorial || conAprobada ? 'renovacion' : 'alta';
}

export function montoEsperado({ cuota, tipo, fecha, anio }) {
  const cuotaN = round2(cuota);
  if (tipo === 'renovacion' || yearOf(fecha) !== Number(anio)) return cuotaN;
  return round2((cuotaN * (13 - monthOf(fecha))) / 12);
}

export function formatMxn(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(Number(value));
}

export function llevaMasDe24h(createdAt, now = Date.now()) {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t > 24 * 60 * 60 * 1000;
}

export function formatFecha(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
