import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.mjs';
import { createPortalApi } from './api.mjs';
import { anioSugerido, aniosPermitidos, hoyChihuahua, montoEsperado, tipoMembresia } from './money.mjs';
import { RESEND_SECONDS, parseMonto } from './validate.mjs';
import { motivoNecesario } from './errors.mjs';
import { renderPortal, textoEsperado } from './view.mjs';

const root = document.getElementById('portal-root');
const hoy = () => hoyChihuahua();

const state = {
  screen: 'loading',
  busy: false,
  email: '',
  secondsLeft: 0,
  error: '',
  hoy: hoy(),
};

let timer = null;
let home = null;

const client = globalThis.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: window.localStorage,
  },
});

const api = createPortalApi(client, { allowedOrigin: new URL(SUPABASE_URL).origin });

function paint() {
  root.innerHTML = renderPortal(state);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function startTimer() {
  stopTimer();
  state.secondsLeft = RESEND_SECONDS;
  timer = setInterval(() => {
    state.secondsLeft -= 1;
    const el = document.getElementById('resend-left');
    if (el) el.textContent = state.secondsLeft > 0 ? `Disponible en ${state.secondsLeft} s` : '';
    if (state.secondsLeft <= 0) {
      stopTimer();
      const btn = document.getElementById('resend');
      if (btn) btn.disabled = false;
    }
  }, 1000);
}

function applyHome(data) {
  home = data;
  Object.assign(state, {
    screen: 'app',
    busy: false,
    error: '',
    userEmail: data.email,
    roles: data.roles,
    socios: data.socios,
    membresias: data.membresias,
    renovaciones: data.renovaciones,
    cuotas: data.cuotas,
    staff: data.staff,
    puedeAprobar: data.puedeAprobar,
    pendientes: data.pendientes,
    hoy: hoy(),
    fecha: hoy(),
    anio: anioSugerido(hoy()),
    pagoError: '',
    pagoNote: '',
    adminError: '',
    adminNote: '',
    esperadoTexto: 'Elija la fecha para consultar la cuota.',
  });
  paint();
  refreshPreview();
}

async function boot() {
  paint();
  const { data } = await client.auth.getSession();
  if (!data.session) {
    state.screen = 'login';
    state.busy = false;
    paint();
    return;
  }
  const loaded = await api.loadHome();
  if (!loaded.ok) {
    state.screen = 'login';
    state.busy = false;
    paint();
    return;
  }
  applyHome(loaded);
}

function socioById(id) {
  return (state.socios || []).find((s) => s.id === id);
}

function localMonto(socioId, fecha, anio) {
  const socio = socioById(socioId);
  const cuota = (state.cuotas || []).find((c) => c.anio === Number(anio));
  if (!socio || !cuota) return null;
  const tipo = tipoMembresia({
    esSocioBase: socio.esSocioBase,
    anio,
    membresias: state.membresias,
    renovaciones: state.renovaciones,
  });
  return montoEsperado({ cuota: cuota.monto, tipo, fecha, anio });
}

async function refreshPreview() {
  const fecha = document.getElementById('fecha')?.value;
  const anio = document.getElementById('anio')?.value;
  const socioId = document.getElementById('socio')?.value;
  const slot = document.getElementById('esperado');
  if (!fecha || !anio || !socioId || !slot) return;
  slot.textContent = 'Consultando la cuota…';
  const local = localMonto(socioId, fecha, anio);
  const preview = await api.previewMonto(socioId, fecha, anio);
  if (!document.getElementById('esperado')) return;
  document.getElementById('esperado').textContent = textoEsperado(
    preview.ok ? { monto: preview.monto, local } : { error: preview.message }
  );
}

function syncAnioOptions() {
  const fecha = document.getElementById('fecha')?.value;
  const select = document.getElementById('anio');
  if (!fecha || !select) return;
  const current = Number(select.value);
  const opts = aniosPermitidos(fecha);
  const next = opts.includes(current) ? current : anioSugerido(fecha);
  select.innerHTML = opts.map((n) => `<option value="${n}">${n}</option>`).join('');
  select.value = String(next);
}

root.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === 'login-form') {
    state.busy = true;
    state.error = '';
    paint();
    const result = await api.sendCode(new FormData(form).get('email'));
    state.busy = false;
    if (!result.ok) {
      state.error = result.message;
      paint();
      return;
    }
    state.email = result.email;
    state.screen = 'code';
    state.error = '';
    startTimer();
    paint();
    return;
  }
  if (form.id === 'code-form') {
    state.busy = true;
    state.error = '';
    paint();
    const result = await api.verifyCode(state.email, new FormData(form).get('code'));
    if (!result.ok) {
      state.busy = false;
      state.screen = 'code';
      state.error = result.message;
      paint();
      return;
    }
    stopTimer();
    const loaded = await api.loadHome();
    if (!loaded.ok) {
      state.busy = false;
      state.screen = 'login';
      state.error = 'Entró, pero no pudimos abrir su ficha. Intente de nuevo.';
      paint();
      return;
    }
    applyHome(loaded);
    return;
  }
  if (form.id === 'pago-form') {
    state.busy = true;
    state.pagoError = '';
    state.pagoNote = '';
    const data = new FormData(form);
    const fecha = data.get('fecha');
    const anio = data.get('anio');
    state.fecha = fecha;
    state.anio = anio;
    state.monto = data.get('monto');
    state.metodo = data.get('metodo');
    state.socioId = data.get('socio');
    const file = form.querySelector('#comprobante').files[0];
    paint();
    const result = await api.reportarPago({
      socioId: data.get('socio'),
      fecha,
      anio,
      monto: data.get('monto'),
      metodo: data.get('metodo'),
      file,
      hoy: hoy(),
    });
    if (!result.ok) {
      state.busy = false;
      state.pagoError = result.message;
      state.fecha = fecha;
      state.anio = anio;
      paint();
      return;
    }
    const loaded = await api.loadHome();
    if (loaded.ok) applyHome(loaded);
    state.pagoNote = 'Recibimos su aviso. Queda pendiente hasta que la Sección lo revise.';
    state.busy = false;
    paint();
    return;
  }
  if (form.id === 'password-form') {
    const msg = document.getElementById('password-msg');
    const result = await api.setPassword(new FormData(form).get('password'));
    if (msg) msg.textContent = result.message;
    if (result.ok) form.reset();
    return;
  }
  if (form.classList.contains('decide-form')) {
    const submitter = event.submitter;
    const decision = submitter?.value;
    const data = new FormData(form);
    const fechaNueva = data.get('fecha');
    const overrideRaw = String(data.get('override') || '').trim();
    const motivo = String(data.get('motivo') || '').trim();
    const reportado = Number(form.dataset.reportado);
    const esperado = form.dataset.esperado === '' ? null : Number(form.dataset.esperado);
    let esperadoNuevo = esperado;
    if (fechaNueva && fechaNueva !== form.dataset.fecha) {
      const preview = await api.previewMonto(
        state.pendientes.find((p) => p.id === form.dataset.id)?.socioId,
        fechaNueva,
        state.pendientes.find((p) => p.id === form.dataset.id)?.anio
      );
      if (preview.ok) esperadoNuevo = preview.monto;
    }
    const override = overrideRaw ? parseMonto(overrideRaw) : null;
    if (override && !override.ok) {
      state.adminError = override.error;
      paint();
      return;
    }
    if (decision === 'aprobar' && motivoNecesario({
      reportado,
      esperado,
      fechaOriginal: form.dataset.fecha,
      fechaNueva,
      override: override ? override.value : '',
      esperadoNuevo,
    }) && !motivo) {
      state.adminError = 'Ese cambio de monto necesita un motivo.';
      paint();
      return;
    }
    state.busy = true;
    state.adminError = '';
    const result = decision === 'rechazar'
      ? await api.rechazar({ id: form.dataset.id, motivo })
      : await api.aprobar({
        id: form.dataset.id,
        fecha: fechaNueva && fechaNueva !== form.dataset.fecha ? fechaNueva : null,
        override: override ? override.value : null,
        motivo,
      });
    if (!result.ok) {
      state.busy = false;
      state.adminError = result.message;
      paint();
      return;
    }
    const loaded = await api.loadHome();
    if (loaded.ok) applyHome(loaded);
    state.adminNote = decision === 'rechazar' ? 'El pago quedó rechazado.' : 'El pago quedó aprobado.';
    state.busy = false;
    paint();
  }
});

root.addEventListener('click', async (event) => {
  const btn = event.target.closest('button');
  if (!btn) return;
  if (btn.id === 'change-email') {
    stopTimer();
    state.screen = 'login';
    state.error = '';
    state.secondsLeft = 0;
    paint();
    return;
  }
  if (btn.id === 'resend') {
    btn.disabled = true;
    const result = await api.sendCode(state.email);
    if (!result.ok) {
      state.error = result.message;
      paint();
      return;
    }
    state.error = '';
    startTimer();
    paint();
    return;
  }
  if (btn.id === 'sign-out') {
    await api.signOut();
    home = null;
    stopTimer();
    Object.assign(state, {
      screen: 'login',
      email: '',
      error: '',
      userEmail: '',
      roles: [],
      socios: [],
      staff: false,
      pendientes: [],
    });
    paint();
  }
});

root.addEventListener('change', (event) => {
  if (event.target?.id === 'fecha') syncAnioOptions();
  if (['fecha', 'anio', 'socio'].includes(event.target?.id)) refreshPreview();
});

boot();
