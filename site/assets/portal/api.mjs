import { mapAuthError, mapRpcError } from './errors.mjs';
import { llevaMasDe24h } from './money.mjs';
import { comprobantePath, validateAnio, validateCode, validateComprobante, validateEmail, validateFechaPago, validatePassword, parseMonto } from './validate.mjs';

export const SIGNED_URL_SECONDS = 120;

export function uploadOptions(contentType) {
  return { upsert: false, contentType };
}

function fail(message, extra = {}) {
  return { ok: false, message, ...extra };
}

export function normalizeRenovacion(row) {
  return {
    id: row.id,
    socioId: row.socio_id,
    anio: Number(row.anio),
    fecha: String(row.fecha_pago).slice(0, 10),
    reportado: row.monto_reportado == null ? null : Number(row.monto_reportado),
    esperado: row.monto_esperado == null ? null : Number(row.monto_esperado),
    estado: row.estado,
    metodo: row.metodo || '',
    path: row.comprobante_path || '',
    motivoRechazo: row.motivo_rechazo || '',
    motivoCambio: row.motivo_cambio || '',
    createdAt: row.created_at,
  };
}

export function createPortalApi(client, deps = {}) {
  const randomUUID = deps.randomUUID || (() => crypto.randomUUID());
  const now = deps.now || (() => Date.now());
  const allowedOrigin = deps.allowedOrigin || '';

  async function rows(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  return {
    async sendCode(rawEmail) {
      const email = validateEmail(rawEmail);
      if (!email.ok) return fail(email.error);
      const { error } = await client.auth.signInWithOtp({
        email: email.email,
        options: { shouldCreateUser: false },
      });
      if (error) return fail(mapAuthError(error, 'send'));
      return { ok: true, email: email.email };
    },

    async verifyCode(email, rawCode) {
      const code = validateCode(rawCode);
      if (!code.ok) return fail(code.error);
      const { error } = await client.auth.verifyOtp({
        email,
        token: code.code,
        type: 'email',
      });
      if (error) return fail(mapAuthError(error, 'verify'));
      return { ok: true };
    },

    async signOut() {
      await client.auth.signOut();
      return { ok: true };
    },

    async setPassword(raw) {
      const password = validatePassword(raw);
      if (!password.ok) return fail(password.error);
      const { error } = await client.auth.updateUser({ password: password.password });
      if (error) return fail(mapAuthError(error, 'password'));
      return { ok: true, message: 'Listo. La próxima vez también puede entrar con esa contraseña, si la Sección lo tiene habilitado.' };
    },

    async previewMonto(socioId, fecha, anio) {
      const { data, error } = await client.rpc('calcular_monto_esperado', {
        p_socio_id: socioId,
        p_fecha: fecha,
        p_anio: Number(anio),
      });
      if (error) return fail(mapRpcError(error).message);
      return { ok: true, monto: Number(data) };
    },

    async reportarPago(input) {
      const fecha = validateFechaPago(input.fecha, input.hoy);
      if (!fecha.ok) return fail(fecha.error);
      const anio = validateAnio(input.anio, fecha.fecha);
      if (!anio.ok) return fail(anio.error);
      const monto = parseMonto(input.monto);
      if (!monto.ok) return fail(monto.error);
      const file = validateComprobante(input.file);
      if (!file.ok) return fail(file.error);
      if (!input.socioId) return fail('Elija la ficha del restaurante.');

      const id = randomUUID();
      const fileId = randomUUID();
      const path = comprobantePath({
        socioId: input.socioId,
        renovacionId: id,
        ext: file.ext,
        fileId,
      });
      const inserted = await client.from('renovaciones').insert({
        id,
        socio_id: input.socioId,
        anio: anio.anio,
        fecha_pago: fecha.fecha,
        monto_reportado: monto.value,
        metodo: input.metodo || null,
        comprobante_path: path,
      }).select('id').single();
      if (inserted.error) return fail(mapRpcError(inserted.error).message);

      const uploaded = await client.storage.from('comprobantes').upload(
        path,
        input.file,
        uploadOptions(file.contentType)
      );
      if (uploaded.error) {
        return fail(
          'El aviso quedó registrado, pero el archivo no se guardó. Envíe otro aviso con el comprobante: no podemos reemplazar el archivo.',
          { code: 'upload' }
        );
      }
      return { ok: true, id, path };
    },

    async aprobar(input) {
      const { data, error } = await client.rpc('aprobar_renovacion', {
        p_renovacion_id: input.id,
        p_fecha_pago: input.fecha || null,
        p_monto_override: input.override == null || input.override === '' ? null : Number(input.override),
        p_motivo: input.motivo ? String(input.motivo).trim() : null,
      });
      if (error) {
        const mapped = mapRpcError(error);
        return fail(mapped.message, { needsMotivo: mapped.needsMotivo });
      }
      return { ok: true, row: data };
    },

    async rechazar(input) {
      const motivo = String(input.motivo || '').trim();
      if (!motivo) return fail('Escriba el motivo del rechazo.', { needsMotivo: true });
      const { error } = await client.rpc('rechazar_renovacion', {
        p_renovacion_id: input.id,
        p_motivo: motivo,
      });
      if (error) {
        const mapped = mapRpcError(error);
        return fail(mapped.message, { needsMotivo: mapped.needsMotivo });
      }
      return { ok: true };
    },

    async loadHome() {
      const userRes = await client.auth.getUser();
      if (userRes.error || !userRes.data?.user) return { ok: false, signedOut: true };
      const user = userRes.data.user;
      const roleRows = await rows(client.from('usuario_roles').select('rol').eq('user_id', user.id));
      const roles = roleRows.map((r) => r.rol);
      const cuentas = await rows(
        client.from('cuentas_socio').select('socio_id, socios(id, nombre, es_socio_base)').eq('user_id', user.id)
      );
      const socios = cuentas.map((c) => ({
        id: c.socios?.id || c.socio_id,
        nombre: c.socios?.nombre || 'Su ficha',
        esSocioBase: Boolean(c.socios?.es_socio_base),
      }));
      const ownIds = socios.map((s) => s.id);
      const membresias = ownIds.length
        ? await rows(client.from('membresias').select('socio_id, anio, estado').in('socio_id', ownIds))
        : [];
      const renovaciones = ownIds.length
        ? (await rows(
          client.from('renovaciones').select('id, socio_id, anio, fecha_pago, monto_reportado, monto_esperado, estado, metodo, comprobante_path, motivo_rechazo, motivo_cambio, created_at').in('socio_id', ownIds).order('created_at', { ascending: false })
        )).map(normalizeRenovacion)
        : [];
      const cuotas = await rows(client.from('cuota_anual').select('anio, monto').order('anio'));
      const staff = roles.some((r) => r === 'tesorero' || r === 'presidente' || r === 'admin_lectura');
      const puedeAprobar = roles.includes('tesorero') || roles.includes('presidente');
      let pendientes = [];
      if (staff) {
        const raw = await rows(
          client.from('renovaciones').select('id, socio_id, anio, fecha_pago, monto_reportado, monto_esperado, estado, metodo, comprobante_path, created_at, socios(nombre, es_socio_base)').eq('estado', 'pendiente').order('created_at', { ascending: true })
        );
        pendientes = [];
        for (const row of raw) {
          const item = normalizeRenovacion(row);
          item.socioNombre = row.socios?.nombre || 'Socio';
          item.esSocioBase = Boolean(row.socios?.es_socio_base);
          item.esPropio = ownIds.includes(item.socioId);
          item.horas24 = llevaMasDe24h(item.createdAt, now());
          const preview = await client.rpc('calcular_monto_esperado', {
            p_socio_id: item.socioId,
            p_fecha: item.fecha,
            p_anio: item.anio,
          });
          item.esperadoServidor = preview.error ? null : Number(preview.data);
          item.comprobanteUrl = '';
          if (item.path) {
            const signed = await client.storage.from('comprobantes').createSignedUrl(item.path, SIGNED_URL_SECONDS, { download: true });
            if (!signed.error && signed.data?.signedUrl) {
              item.comprobanteUrl = safeDownloadUrl(signed.data.signedUrl, allowedOrigin);
            }
          }
          pendientes.push(item);
        }
      }
      return {
        ok: true,
        email: user.email || '',
        roles,
        socios,
        membresias: membresias.map((m) => ({ socioId: m.socio_id, anio: Number(m.anio), estado: m.estado })),
        renovaciones,
        cuotas: cuotas.map((c) => ({ anio: Number(c.anio), monto: Number(c.monto) })),
        staff,
        puedeAprobar,
        pendientes,
      };
    },
  };
}

export function safeDownloadUrl(url, allowedOrigin) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return '';
    if (allowedOrigin && parsed.origin !== allowedOrigin) return '';
    return parsed.href;
  } catch {
    return '';
  }
}
