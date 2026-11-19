/**
 * Recorrido del portal contra un Supabase simulado.
 * Playwright se carga desde PLAYWRIGHT_ENTRY (no hay package.json en el repo).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { test } from 'node:test';

const entry = process.env.PLAYWRIGHT_ENTRY;
if (!entry) {
  throw new Error('Defina PLAYWRIGHT_ENTRY con la ruta a playwright/index.js');
}
const { chromium } = await import(pathToFileURL(entry).href);

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'site');
const shotDir = process.env.PORTAL_SHOT_DIR || '/tmp/portal-shots';
mkdirSync(shotDir, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SOCIO = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const USER = '22222222-2222-4222-8222-222222222222';

function jwt(userId, email) {
  const part = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part({
    sub: userId,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: 4102444800,
  })}.sig`;
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = normalize(join(siteRoot, rel));
  if (!file.startsWith(siteRoot)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const body = readFileSync(file);
    if (!statSync(file).isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

const port = await listen(server);
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
const mode = { role: 'socio', otp: 'ok', failHome: 0, lastApprove: null };
const seen = [];
let uploads = [];

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { date: 'Thu, 19 Nov 2026 18:00:00 GMT' },
    body: JSON.stringify(body),
  });
}

function userOf(email) {
  return {
    id: USER,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

async function installApi(page) {
  await page.route('https://lynbusuqmexsehpvaqev.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    seen.push(`${req.method()} ${url.pathname}`);
    let body = {};
    try { body = req.postData() ? JSON.parse(req.postData()) : {}; } catch { body = {}; }
    const path = url.pathname;

    if (path.endsWith('/otp')) {
      if (mode.otp === 'missing') {
        return json(route, { error_code: 'user_not_found', msg: 'User not found' }, 422);
      }
      if (mode.otp === 'rate') {
        return json(route, { error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 429);
      }
      const raw = req.postData() || '';
      assert.match(raw, /"create_user":false/);
      return json(route, {});
    }
    if (path.endsWith('/verify')) {
      return json(route, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
    }
    if (path.endsWith('/user')) return json(route, userOf(mode.email || 'socio@example.test'));
    if (path.endsWith('/logout')) return route.fulfill({ status: 204, body: '' });
    if (path.includes('/token')) {
      return json(route, {
        access_token: jwt(USER, mode.email),
        refresh_token: 'refresh-test',
        expires_in: 3600,
        expires_at: 4102444800,
        token_type: 'bearer',
        user: userOf(mode.email),
      });
    }
    if (path.includes('/rest/v1/usuario_roles')) {
      if (mode.failHome) {
        mode.failHome -= 1;
        return json(route, { message: 'permission denied', code: '42501' }, 500);
      }
      const roles = {
        socio: ['socio'],
        tesorero: ['tesorero', 'socio'],
        lectura: ['admin_lectura'],
      }[mode.role] || [];
      return json(route, roles.map((rol) => ({ rol })));
    }
    if (path.includes('/rest/v1/cuentas_socio')) {
      if (mode.role === 'lectura') return json(route, []);
      return json(route, [{
        socio_id: SOCIO,
        socios: { id: SOCIO, nombre: 'Fonda del Puente', es_socio_base: false },
      }]);
    }
    if (path.includes('/rest/v1/membresias')) {
      return json(route, [{ socio_id: SOCIO, anio: 2026, estado: 'activa' }]);
    }
    if (path.includes('/rest/v1/cuota_anual')) {
      return json(route, [{ anio: 2026, monto: 1200 }, { anio: 2027, monto: 1200 }]);
    }
    if (path.includes('/rest/v1/renovaciones') && req.method() === 'POST') {
      return json(route, { id: body.id });
    }
    if (path.includes('/rest/v1/renovaciones')) {
      const pending = url.search.includes('estado=eq.pendiente');
      if (!pending) {
        const rows = [{
          id: '55555555-5555-4555-8555-555555555555',
          socio_id: SOCIO,
          anio: 2026,
          fecha_pago: '2026-03-02',
          monto_reportado: 1000,
          monto_esperado: 1000,
          estado: 'aprobada',
          metodo: 'transferencia',
          comprobante_path: null,
          motivo_rechazo: null,
          motivo_cambio: null,
          created_at: '2026-03-02T18:00:00.000Z',
        }];
        if (uploads.length) {
          rows.unshift({
            id: '88888888-8888-4888-8888-888888888888',
            socio_id: SOCIO,
            anio: 2027,
            fecha_pago: '2026-11-19',
            monto_reportado: 1200,
            monto_esperado: null,
            estado: 'pendiente',
            metodo: 'transferencia',
            comprobante_path: null,
            motivo_rechazo: null,
            motivo_cambio: null,
            created_at: '2026-11-19T18:00:00.000Z',
          });
        }
        return json(route, rows);
      }
      return json(route, [
        {
          id: '66666666-6666-4666-8666-666666666666',
          socio_id: SOCIO,
          anio: 2027,
          fecha_pago: '2026-11-01',
          monto_reportado: 1200,
          estado: 'pendiente',
          metodo: 'transferencia',
          comprobante_path: `${SOCIO}/66666666-6666-4666-8666-666666666666/comprobante-a.pdf`,
          created_at: '2026-11-17T12:00:00.000Z',
          socios: { nombre: 'Fonda del Puente', es_socio_base: false },
        },
        {
          id: '77777777-7777-4777-8777-777777777777',
          socio_id: OTHER,
          anio: 2027,
          fecha_pago: '2026-11-02',
          monto_reportado: 1200,
          estado: 'pendiente',
          metodo: 'efectivo',
          comprobante_path: `${OTHER}/77777777-7777-4777-8777-777777777777/comprobante-b.pdf`,
          created_at: '2026-11-19T18:00:00.000Z',
          socios: { nombre: 'Cocina Norte', es_socio_base: true },
        },
      ]);
    }
    if (path.includes('/rpc/calcular_monto_esperado')) return json(route, 1200);
    if (path.includes('/rpc/aprobar_renovacion')) {
      mode.lastApprove = body;
      if (!body.p_motivo) {
        return json(route, { message: 'la diferencia de monto requiere motivo', code: 'P0001' }, 400);
      }
      return json(route, { id: body.p_renovacion_id, estado: 'aprobada' });
    }
    if (path.includes('/rpc/rechazar_renovacion')) return json(route, { id: body.p_renovacion_id, estado: 'rechazada' });
    if (path.includes('/object/sign/')) {
      return json(route, { signedURL: '/object/sign/comprobantes/ticket.pdf?token=abc' });
    }
    if (path.includes('/storage/v1/object/comprobantes')) {
      uploads.push(req.headers()['x-upsert'] || '');
      return json(route, { Key: path });
    }
    return json(route, {});
  });
}

async function setSession(page, email) {
  mode.email = email;
  const session = {
    access_token: jwt(USER, email),
    refresh_token: 'refresh-test',
    expires_in: 360000,
    expires_at: 4102444800,
    token_type: 'bearer',
    user: userOf(email),
  };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: 'sb-lynbusuqmexsehpvaqev-auth-token',
    value: JSON.stringify(session),
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

test('recorrido del portal', { timeout: 90000 }, async () => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: shotDir, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => seen.push(`PAGE ${err.message}`));
  await installApi(page);

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('link', { name: 'Socios' }).first().waitFor();
  assert.equal(await page.locator('#spinBtn').count(), 1);

  await page.goto(`${base}/portal/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Portal de socios' }).waitFor();
  await page.screenshot({ path: join(shotDir, 'portal_login_desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('link', { name: 'Socios' }).last().waitFor();
  await page.screenshot({ path: join(shotDir, 'portal_login_mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.locator('#email').fill('invitado@example.test');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByRole('heading', { name: 'Revise su correo' }).waitFor();
  assert.equal(await page.locator('#resend').isDisabled(), true);
  await page.locator('#code').fill('000000');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.getByText('El código venció').waitFor();
  await page.screenshot({ path: join(shotDir, 'portal_codigo_vencido.png'), fullPage: true });

  await page.getByRole('button', { name: 'Usar otro correo' }).click();
  mode.otp = 'missing';
  await page.locator('#email').fill('nadie@example.test');
  await page.getByRole('button', { name: 'Enviar código' }).click();
  const neutral = await page.locator('.portal-alert').innerText();
  assert.match(neutral, /invitación/);
  assert.doesNotMatch(neutral, /no existe|not found|no está registrado/i);

  mode.otp = 'rate';
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByText('Demasiados intentos').waitFor();

  mode.otp = 'ok';
  mode.role = 'socio';
  await setSession(page, 'socio@example.test');
  await page.getByRole('heading', { name: 'Su membresía' }).waitFor();
  await page.getByText('Fonda del Puente').first().waitFor();
  await page.getByText('Al día').waitFor();
  await page.locator('#monto').fill('1200');
  await page.locator('#comprobante').setInputFiles({
    name: 'ticket.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 ticket'),
  });
  await page.getByRole('button', { name: 'Enviar aviso de pago' }).click();
  await page.getByText('Recibimos su aviso').waitFor();
  assert.deepEqual(uploads, ['false']);
  await page.screenshot({ path: join(shotDir, 'portal_socio_reportar.png'), fullPage: true });

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('heading', { name: 'Portal de socios' }).waitFor();
  const stored = await page.evaluate(() => localStorage.getItem('sb-lynbusuqmexsehpvaqev-auth-token'));
  assert.equal(stored, null);

  mode.role = 'tesorero';
  await setSession(page, 'tesoreria@example.test');
  await page.getByRole('heading', { name: 'Pagos por revisar' }).waitFor();
  await page.getByText('otro firmante').waitFor();
  await page.getByText('Lleva más de 24 horas').waitFor();
  await page.getByText('Cocina Norte').waitFor();
  assert.equal(await page.locator('button[value="aprobar"]').count(), 1);
  assert.equal(seen.filter((line) => line.includes('/object/sign/')).length, 0);
  await page.screenshot({ path: join(shotDir, 'portal_admin_cola.png'), fullPage: true });
  const signed = page.waitForResponse((res) => res.url().includes('/object/sign/'));
  await page.getByRole('button', { name: 'Descargar comprobante' }).first().click();
  await signed;
  const decide = page.locator('form.decide-form');
  await decide.locator('input[name="fecha"]').fill('2026-10-20');
  await decide.locator('input[name="override"]').fill('900');
  await page.locator('button[value="aprobar"]').click();
  await page.getByText('necesita un motivo').waitFor();
  assert.equal(await decide.locator('input[name="fecha"]').inputValue(), '2026-10-20');
  assert.equal(await decide.locator('input[name="override"]').inputValue(), '900');
  await page.screenshot({ path: join(shotDir, 'portal_admin_motivo.png'), fullPage: true });
  await decide.locator('textarea[name="motivo"]').fill('El comprobante coincide con la cuota.');
  await page.locator('button[value="aprobar"]').click();
  await page.getByText('quedó aprobado').waitFor();
  assert.equal(mode.lastApprove.p_fecha_pago, '2026-10-20');
  assert.equal(mode.lastApprove.p_monto_override, 900);
  assert.match(mode.lastApprove.p_motivo, /comprobante/);

  mode.role = 'lectura';
  await setSession(page, 'consulta@example.test');
  await page.getByText('puede consultar').waitFor();
  assert.equal(await page.locator('button[value="aprobar"]').count(), 0);
  await page.screenshot({ path: join(shotDir, 'portal_admin_lectura.png'), fullPage: true });
  await page.locator('#password').fill('corta');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await page.getByText('al menos 10 caracteres').waitFor();
  await page.locator('#password').fill('Abcdefghij1!');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await page.getByText('La próxima vez también puede entrar').waitFor();

  mode.failHome = 1;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Reintentar' }).waitFor();
  assert.equal(await page.getByText('Abriendo su sesión').count(), 0);
  assert.equal(await page.locator('#retry-home').isDisabled(), false);
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await page.getByText('puede consultar').waitFor();

  await context.close();
});

test.after(async () => {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
});
