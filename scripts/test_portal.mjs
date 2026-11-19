import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPortalApi, safeDownloadUrl, uploadOptions } from '../site/assets/portal/api.mjs';
import { mapAuthError, mapRpcError, motivoNecesario } from '../site/assets/portal/errors.mjs';
import { hoyChihuahua, montoEsperado, tipoMembresia } from '../site/assets/portal/money.mjs';
import {
  comprobantePath,
  parseMonto,
  validateAnio,
  validateCode,
  validateComprobante,
  validateEmail,
  validateFechaPago,
  validatePassword,
} from '../site/assets/portal/validate.mjs';
import { captureDecideDrafts, escapeHtml, renderPortal } from '../site/assets/portal/view.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOCIO = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const ORIGIN = 'https://lynbusuqmexsehpvaqev.supabase.co';

test('la cuota prorratea como el servidor', () => {
  const meses = [1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
  meses.forEach((esperado, index) => {
    const fecha = `2027-${String(index + 1).padStart(2, '0')}-15`;
    assert.equal(montoEsperado({ cuota: 1200, tipo: 'alta', fecha, anio: 2027 }), esperado, fecha);
  });
  assert.equal(montoEsperado({ cuota: 1000, tipo: 'alta', fecha: '2027-02-01', anio: 2027 }), 916.67);
  assert.equal(
    montoEsperado({ cuota: '1200.00', tipo: 'renovacion', fecha: '2026-12-15', anio: 2027 }),
    1200
  );
  assert.equal(montoEsperado({ cuota: 1200, tipo: 'alta', fecha: '2026-12-15', anio: 2027 }), 1200);
});

test('el tipo sigue la historia y el socio base', () => {
  assert.equal(tipoMembresia({ esSocioBase: true, anio: 2027 }), 'renovacion');
  assert.equal(tipoMembresia({
    esSocioBase: false,
    anio: 2027,
    membresias: [{ anio: 2026, estado: 'activa' }],
  }), 'renovacion');
  assert.equal(tipoMembresia({
    esSocioBase: false,
    anio: 2027,
    renovaciones: [{ anio: 2026, estado: 'aprobada' }],
  }), 'renovacion');
  assert.equal(tipoMembresia({
    esSocioBase: false,
    anio: 2027,
    renovaciones: [{ anio: 2026, estado: 'rechazada' }],
    membresias: [{ anio: 2027, estado: 'activa' }],
  }), 'alta');
});

test('la fecha no puede ser futura y el año es el de la fecha o el siguiente', () => {
  assert.equal(hoyChihuahua(new Date('2026-11-20T05:30:00Z')), '2026-11-19');
  assert.equal(hoyChihuahua(new Date('2026-11-20T06:30:00Z')), '2026-11-20');
  assert.equal(validateFechaPago('2026-11-20', '2026-11-19').ok, false);
  assert.equal(validateFechaPago('2026-11-19', '2026-11-19').ok, true);
  assert.equal(validateFechaPago('2025-12-31', '2026-11-19').ok, false);
  assert.equal(validateAnio(2028, '2026-11-19').ok, false);
  assert.equal(validateAnio(2027, '2026-11-19').ok, true);
  assert.equal(validateAnio(2026, '2026-11-19').ok, true);
});

test('el comprobante y la contraseña se validan antes de salir del navegador', () => {
  const diez = 10 * 1024 * 1024;
  assert.equal(validateComprobante({ name: 'a.pdf', size: diez + 1, type: 'application/pdf' }).ok, false);
  assert.equal(validateComprobante({ name: 'a.exe', size: 20, type: 'application/octet-stream' }).ok, false);
  assert.equal(validateComprobante({ name: 'a.pdf', size: 20, type: 'text/html' }).ok, false);
  const ok = validateComprobante({ name: 'foto.JPEG', size: diez, type: 'image/jpeg' });
  assert.equal(ok.ok, true);
  assert.equal(ok.ext, 'jpg');
  assert.equal(validateComprobante({ name: 'a.pdf', size: 20, type: '' }).ok, true);
  assert.match(validatePassword('corta1A!').error, /10 caracteres/);
  assert.match(validatePassword('abcdefghij1!').error, /mayúscula/);
  assert.match(validatePassword('ABCDEFGHIJ1!').error, /minúscula/);
  assert.match(validatePassword('Abcdefghij!').error, /dígito/);
  assert.match(validatePassword('Abcdefghij1').error, /símbolo/);
  assert.equal(validatePassword('Abcdefghij1!').ok, true);
  assert.equal(parseMonto('1,200.50').value, 1200.5);
  assert.equal(parseMonto('1200,5').value, 1200.5);
  assert.equal(parseMonto('12.345').ok, false);
  assert.equal(parseMonto('-1').ok, false);
  assert.equal(validateEmail('  Socio@Example.Test ').email, 'socio@example.test');
  assert.equal(validateCode('12345').ok, false);
  assert.equal(validateCode('123456').ok, true);
});

test('los errores de acceso no dicen si el correo existe', () => {
  assert.match(mapAuthError({ error_code: 'user_not_found', message: 'User not found' }, 'send'), /invitación/);
  assert.match(mapAuthError({ message: 'Signups not allowed' }, 'send'), /invitación/);
  assert.doesNotMatch(mapAuthError({ message: 'User not found' }, 'send'), /no existe|not found/i);
  assert.match(mapAuthError({ error_code: 'over_request_rate_limit', message: 'too many' }, 'send'), /Demasiados intentos/);
  assert.match(mapAuthError({ code: 'otp_expired', message: 'Token has expired or is invalid' }, 'verify'), /venció/);
  assert.match(mapAuthError({ message: 'Token is invalid' }, 'verify'), /no coincide/);
  assert.match(mapAuthError({ message: 'weak password' }, 'password'), /10 caracteres/);
  assert.match(mapAuthError({ message: 'network down' }, 'send'), /Intente de nuevo/);
});

test('los errores del RPC se traducen y el motivo sale cuando el servidor lo pide', () => {
  const cases = [
    ['no puede aprobar su propia renovacion', /otro firmante/, false],
    ['no puede rechazar su propia renovacion', /otro firmante/, false],
    ['ya hay una renovacion aprobada para ese año', /ya tiene una renovación/, false],
    ['fecha_pago no puede ser futura', /Chihuahua/, false],
    ['la diferencia de monto requiere motivo', /motivo/, true],
    ['rechazo requiere motivo', /motivo/, true],
    ['monto invalido', /2 decimales/, false],
    ['solo tesorero o presidente pueden aprobar', /no aprobar/, false],
    ['la renovacion no esta pendiente', /ya no está pendiente/, false],
    ['renovacion no encontrada', /No encontramos/, false],
    ['no hay cuota_anual para 2027', /cuota configurada/, false],
    ['no autorizado', /permiso/, false],
  ];
  for (const [message, pattern, needsMotivo] of cases) {
    const mapped = mapRpcError({ message });
    assert.match(mapped.message, pattern, message);
    assert.equal(mapped.needsMotivo, needsMotivo, message);
  }
  assert.match(mapRpcError({ message: 'unexpected' }).message, /Intente de nuevo/);
  assert.equal(motivoNecesario({ reportado: 100, esperado: 1200, fechaOriginal: '2026-11-01', fechaNueva: '2026-11-01' }), true);
  assert.equal(motivoNecesario({
    reportado: 1200,
    esperado: 1200,
    fechaOriginal: '2026-11-01',
    fechaNueva: '2026-12-01',
    esperadoNuevo: 100,
  }), true);
  assert.equal(motivoNecesario({
    reportado: 1200,
    esperado: 1200,
    fechaOriginal: '2026-11-01',
    fechaNueva: '2026-11-02',
    esperadoNuevo: 1200,
    override: '',
  }), false);
});

test('el aviso inserta la fila y sube con upsert false', async () => {
  const calls = [];
  let n = 0;
  const ids = [
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  ];
  const client = {
    auth: {},
    from(table) {
      const q = {
        insert(row) {
          calls.push(['insert', table, row]);
          q.row = row;
          return q;
        },
        select() { return q; },
        single() { return Promise.resolve({ data: { id: q.row.id }, error: null }); },
      };
      return q;
    },
    storage: {
      from(bucket) {
        return {
          upload(path, file, options) {
            calls.push(['upload', bucket, path, options, file]);
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
  const api = createPortalApi(client, { randomUUID: () => ids[n++] });
  const file = { name: 'ticket.jpeg', size: 1200, type: 'image/jpeg' };
  const result = await api.reportarPago({
    socioId: SOCIO,
    fecha: '2026-11-19',
    anio: 2027,
    monto: '1200',
    metodo: 'transferencia',
    file,
    hoy: '2026-11-19',
  });
  assert.equal(result.ok, true);
  const inserted = calls[0][2];
  assert.equal(inserted.socio_id, SOCIO);
  assert.equal(Object.hasOwn(inserted, 'tipo'), false);
  assert.equal(Object.hasOwn(inserted, 'estado'), false);
  assert.equal(inserted.comprobante_path, comprobantePath({
    socioId: SOCIO,
    renovacionId: ids[0],
    ext: 'jpg',
    fileId: ids[1],
  }));
  assert.deepEqual(calls[1][3], uploadOptions('image/jpeg'));
  assert.equal(calls[1][3].upsert, false);
  assert.equal(calls[1][2], inserted.comprobante_path);

  client.storage.from = () => ({
    upload: () => Promise.resolve({ error: { message: 'no' } }),
  });
  n = 0;
  const failed = await api.reportarPago({
    socioId: SOCIO,
    fecha: '2026-11-19',
    anio: 2027,
    monto: '1200',
    file,
    hoy: '2026-11-19',
  });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /otro aviso/);
});

test('el codigo sale con shouldCreateUser false y la sesion se cierra', async () => {
  const seen = [];
  const client = {
    auth: {
      signInWithOtp: async (args) => { seen.push(args); return { error: null }; },
      verifyOtp: async (args) => { seen.push(args); return { error: null }; },
      signOut: async () => { seen.push('out'); return { error: null }; },
      updateUser: async (args) => { seen.push(args); return { error: null }; },
    },
  };
  const api = createPortalApi(client);
  const sent = await api.sendCode(' Socio@Example.Test ');
  assert.equal(sent.ok, true);
  assert.equal(seen[0].options.shouldCreateUser, false);
  const verified = await api.verifyCode(sent.email, '123456');
  assert.equal(verified.ok, true);
  assert.equal(seen[1].type, 'email');
  assert.equal((await api.signOut()).ok, true);
  assert.equal(seen[2], 'out');
  assert.equal((await api.setPassword('Abcdefghij1!')).ok, true);
  assert.equal((await api.setPassword('corta')).ok, false);
});

test('la cola marca el pago propio y solo abre https del proyecto', async () => {
  const created = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const row = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    socio_id: SOCIO,
    anio: 2027,
    fecha_pago: '2026-11-01',
    monto_reportado: 1200,
    monto_esperado: null,
    estado: 'pendiente',
    metodo: 'transferencia',
    comprobante_path: `${SOCIO}/cccccccc-cccc-4ccc-8ccc-cccccccccccc/comprobante-x.pdf`,
    created_at: created,
    socios: { nombre: 'Fonda del Puente', es_socio_base: true },
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1', email: 'socio@example.test' } }, error: null }),
    },
    from(table) {
      const data = {
        usuario_roles: [{ rol: 'tesorero' }, { rol: 'socio' }],
        cuentas_socio: [{ socio_id: SOCIO, socios: { id: SOCIO, nombre: 'Fonda del Puente', es_socio_base: true } }],
        membresias: [{ socio_id: SOCIO, anio: 2026, estado: 'activa' }],
        renovaciones: [row],
        cuota_anual: [{ anio: 2027, monto: 1200 }],
      }[table] || [];
      const q = {
        select() { return q; },
        eq() { return q; },
        in() { return q; },
        order() { return q; },
        then(resolve, reject) { return Promise.resolve({ data, error: null }).then(resolve, reject); },
      };
      return q;
    },
    rpc() { return Promise.resolve({ data: 1200, error: null }); },
    storage: {
      from() {
        return {
          createSignedUrl(path, seconds, options) {
            signed += 1;
            assert.equal(seconds, 120);
            assert.equal(options.download, true);
            return Promise.resolve({
              data: { signedUrl: `${ORIGIN}/storage/v1/object/sign/${path}?token=abc` },
              error: null,
            });
          },
        };
      },
    },
  };
  let signed = 0;
  const api = createPortalApi(client, { allowedOrigin: ORIGIN });
  const home = await api.loadHome();
  assert.equal(signed, 0);
  assert.equal(home.puedeAprobar, true);
  assert.equal(home.pendientes[0].esPropio, true);
  assert.equal(home.pendientes[0].horas24, true);
  assert.equal(home.pendientes[0].comprobanteUrl, undefined);
  const file = await api.comprobanteFirmado(home.pendientes[0].path);
  assert.equal(signed, 1);
  assert.equal(file.ok, true);
  assert.equal(file.url.startsWith(`${ORIGIN}/`), true);
  const again = await api.comprobanteFirmado(home.pendientes[0].path);
  assert.equal(signed, 2);
  assert.equal(again.ok, true);
  assert.equal(safeDownloadUrl('javascript:alert(1)', ORIGIN), '');
  assert.equal(safeDownloadUrl('http://lynbusuqmexsehpvaqev.supabase.co/a', ORIGIN), '');
  assert.equal(safeDownloadUrl('https://otro.supabase.co/a', ORIGIN), '');
  assert.equal(OTHER === SOCIO, false);
});

test('las pantallas escapan el texto y respetan quien puede decidir', () => {
  assert.equal(escapeHtml(`<img src=x onerror=alert(1)>`), '&lt;img src=x onerror=alert(1)&gt;');
  const socio = renderPortal({
    screen: 'app',
    userEmail: 'socio@example.test',
    roles: ['socio'],
    socios: [{ id: SOCIO, nombre: 'Fonda <Puente>', esSocioBase: false }],
    membresias: [{ socioId: SOCIO, anio: 2026, estado: 'activa' }],
    renovaciones: [{
      id: '1', socioId: SOCIO, anio: 2027, fecha: '2026-11-01', reportado: 100,
      esperado: 200, estado: 'rechazada', motivoRechazo: 'falta <dato>',
    }],
    hoy: '2026-11-19',
    fecha: '2026-11-19',
    anio: 2027,
    staff: false,
  });
  assert.match(socio, /Fonda &lt;Puente&gt;/);
  assert.match(socio, /falta &lt;dato&gt;/);
  assert.match(socio, /Reportar pago/);
  assert.match(socio, /Al día/);
  assert.doesNotMatch(socio, /value="aprobar"/);

  const propio = renderPortal({
    screen: 'app',
    userEmail: 'tesorero@example.test',
    roles: ['tesorero'],
    socios: [{ id: SOCIO, nombre: 'Fonda del Puente', esSocioBase: true }],
    membresias: [],
    renovaciones: [],
    hoy: '2026-11-19',
    staff: true,
    puedeAprobar: true,
    pendientes: [{
      id: 'p1', socioId: SOCIO, socioNombre: 'Fonda del Puente', esSocioBase: true,
      esPropio: true, horas24: true, anio: 2027, fecha: '2026-11-01', reportado: 1200,
      esperadoServidor: 1200, path: `${SOCIO}/a.pdf`,
    }],
  });
  assert.match(propio, /otro firmante/);
  assert.match(propio, /Lleva más de 24 horas/);
  assert.match(propio, /Descargar comprobante/);
  assert.match(propio, /data-comprobante-path="/);
  assert.doesNotMatch(propio, /<a href=/);
  assert.doesNotMatch(propio, /value="aprobar"/);

  const lectura = renderPortal({
    screen: 'app',
    userEmail: 'lectura@example.test',
    roles: ['admin_lectura'],
    socios: [],
    hoy: '2026-11-19',
    staff: true,
    puedeAprobar: false,
    pendientes: [{
      id: 'p2', socioId: OTHER, socioNombre: 'Cocina Norte', esSocioBase: false,
      esPropio: false, horas24: false, anio: 2027, fecha: '2026-11-01', reportado: 1200,
      esperadoServidor: 1200, comprobanteUrl: '',
    }],
  });
  assert.match(lectura, /Puede consultar la cola/);
  assert.doesNotMatch(lectura, /value="aprobar"/);
  assert.match(renderPortal({ screen: 'login' }), /Enviar código/);
  assert.match(renderPortal({ screen: 'code', email: 'a@example.test', secondsLeft: 30 }), /Reenviar código/);
  const fallo = renderPortal({ screen: 'load-error', error: 'No pudimos cargar su información.', busy: false });
  assert.match(fallo, /Reintentar/);
  assert.match(fallo, /No pudimos cargar su información/);
  assert.doesNotMatch(fallo, /Abriendo su sesión/);
  assert.doesNotMatch(fallo, /disabled/);
});

test('un error al cargar no se propaga y el comprobante se firma al pedirlo', async () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'a@example.test' } }, error: null }) },
    from() {
      const q = {
        select() { return q; },
        eq() { return q; },
        in() { return q; },
        order() { return q; },
        then(resolve, reject) {
          return Promise.resolve({ data: null, error: { message: 'permission denied' } }).then(resolve, reject);
        },
      };
      return q;
    },
    storage: { from() { return { createSignedUrl() { throw new Error('no debía firmarse'); } }; } },
  };
  const home = await createPortalApi(client, { allowedOrigin: ORIGIN }).loadHome();
  assert.equal(home.ok, false);
  assert.match(home.message, /No pudimos cargar/);
});

test('la corrección del tesorero sobrevive al redibujado', () => {
  const root = {
    querySelectorAll(sel) {
      assert.equal(sel, 'form.decide-form');
      return [{
        dataset: { id: 'p2' },
        elements: {
          fecha: { value: '2026-10-20' },
          override: { value: '900' },
          motivo: { value: 'Cuota de octubre' },
        },
      }];
    },
  };
  const drafts = captureDecideDrafts(root, {});
  assert.deepEqual(drafts.p2, { fecha: '2026-10-20', override: '900', motivo: 'Cuota de octubre' });
  const html = renderPortal({
    screen: 'app',
    userEmail: 'tesorero@example.test',
    roles: ['tesorero'],
    socios: [],
    hoy: '2026-11-19',
    staff: true,
    puedeAprobar: true,
    adminError: 'Ese cambio de monto necesita un motivo.',
    drafts,
    pendientes: [{
      id: 'p2', socioId: OTHER, socioNombre: 'Cocina Norte', esSocioBase: false,
      esPropio: false, horas24: false, anio: 2027, fecha: '2026-11-02', reportado: 1200,
      esperadoServidor: 1200, path: `${OTHER}/b.pdf`,
    }],
  });
  assert.match(html, /data-fecha="2026-11-02"/);
  assert.match(html, /value="2026-10-20"/);
  assert.match(html, /value="900"/);
  assert.match(html, /Cuota de octubre/);
  assert.match(html, /necesita un motivo/);
});

test('el repo no guarda la service role ni abre otros origenes', () => {
  const headers = readFileSync(join(root, 'site/_headers'), 'utf8');
  assert.match(headers, /connect-src 'self' https:\/\/lynbusuqmexsehpvaqev\.supabase\.co wss:\/\/lynbusuqmexsehpvaqev\.supabase\.co/);
  assert.doesNotMatch(headers, /\*\.supabase\.co/);
  const layout = readFileSync(join(root, 'site/assets/layout.js'), 'utf8');
  assert.match(layout, /href: '\/portal\/', label: 'Socios'/);
  const vendor = readFileSync(join(root, 'site/assets/vendor/supabase.js'));
  const hash = createHash('sha256').update(vendor).digest('hex');
  assert.equal(hash, '8816af04d9915dbba1882d6f84f0b402dc40268063a63d9c66d24f52f371c263');
  const config = readFileSync(join(root, 'site/assets/portal/config.mjs'), 'utf8');
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /service_role/);
  const app = readFileSync(join(root, 'site/assets/portal/app.mjs'), 'utf8');
  assert.match(app, /detectSessionInUrl: false/);
  assert.doesNotMatch(app, /localStorage\.setItem|sessionStorage/);
  const api = readFileSync(join(root, 'site/assets/portal/api.mjs'), 'utf8');
  assert.match(api, /shouldCreateUser: false/);
  assert.match(api, /type: 'email'/);
});
