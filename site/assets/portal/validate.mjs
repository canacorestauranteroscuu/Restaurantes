import { aniosPermitidos, hoyChihuahua } from './money.mjs';

export const MAX_COMPROBANTE_BYTES = 10 * 1024 * 1024;
export const RESEND_SECONDS = 60;

const MIME_EXT = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'application/pdf': ['pdf'],
};

export function validateEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, error: 'Escriba un correo válido.' };
  }
  return { ok: true, email };
}

export function validateCode(raw) {
  const code = String(raw || '').trim();
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: 'El código tiene 6 dígitos.' };
  }
  return { ok: true, code };
}

export function parseMonto(raw) {
  let s = String(raw ?? '').trim().replace(/\s/g, '');
  if (!s) return { ok: false, error: 'Escriba el monto que pagó.' };
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return { ok: false, error: 'Escriba un monto con a lo más 2 decimales.' };
  }
  const value = Number(s);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: 'El monto no puede ser negativo.' };
  }
  return { ok: true, value };
}

export function validateFechaPago(fecha, hoy = hoyChihuahua()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) {
    return { ok: false, error: 'Elija la fecha del pago.' };
  }
  if (fecha < '2026-01-01' || fecha > '2036-12-31') {
    return { ok: false, error: 'La fecha tiene que estar entre 2026 y 2036.' };
  }
  if (fecha > hoy) {
    return { ok: false, error: 'La fecha del pago no puede ser posterior a hoy en Chihuahua.' };
  }
  return { ok: true, fecha };
}

export function validateAnio(anio, fecha) {
  const n = Number(anio);
  if (!aniosPermitidos(fecha).includes(n)) {
    return { ok: false, error: 'El año de la membresía tiene que ser el de la fecha o el siguiente.' };
  }
  return { ok: true, anio: n };
}

export function extensionOf(name) {
  const base = String(name || '').split(/[/\\]/).pop();
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function validateComprobante(file) {
  if (!file) return { ok: false, error: 'Adjunte el comprobante (JPG, PNG o PDF, hasta 10 MB).' };
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  if (size > MAX_COMPROBANTE_BYTES) {
    return { ok: false, error: 'El comprobante no puede pasar de 10 MB.' };
  }
  const ext = extensionOf(file.name);
  const type = String(file.type || '').toLowerCase();
  const contentType = Object.entries(MIME_EXT).find(([, exts]) => exts.includes(ext))?.[0];
  if (!contentType || (type && type !== contentType)) {
    return { ok: false, error: 'Solo aceptamos JPG, PNG o PDF.' };
  }
  return { ok: true, ext: ext === 'jpeg' ? 'jpg' : ext, contentType };
}

export function validatePassword(raw) {
  const password = String(raw ?? '');
  const missing = [];
  if (password.length < 10) missing.push('al menos 10 caracteres');
  if (!/[a-z]/.test(password)) missing.push('una minúscula');
  if (!/[A-Z]/.test(password)) missing.push('una mayúscula');
  if (!/[0-9]/.test(password)) missing.push('un dígito');
  if (!/[^A-Za-z0-9]/.test(password)) missing.push('un símbolo');
  if (missing.length) {
    return { ok: false, error: `La contraseña necesita ${missing.join(', ')}.` };
  }
  return { ok: true, password };
}

export function comprobantePath({ socioId, renovacionId, ext, fileId }) {
  return `${socioId}/${renovacionId}/comprobante-${fileId}.${ext}`;
}
