import { formatFecha, formatMxn, hoyChihuahua, anioSugerido, aniosPermitidos } from './money.mjs';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function alert(message) {
  if (!message) return '';
  return `<p class="portal-alert" role="alert">${escapeHtml(message)}</p>`;
}

function note(message) {
  if (!message) return '';
  return `<p class="portal-note" role="status">${escapeHtml(message)}</p>`;
}

const ESTADO = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  activa: 'Al día',
  vencida: 'Vencida',
  en_revision: 'En revisión',
};

export function renderLogin(state) {
  return `<section class="portal-card">
    <p class="eyebrow">Sección Restauranteros</p>
    <h1>Portal de socios</h1>
    <p>El acceso es por invitación. Escriba el correo con el que lo invitó la Sección y le enviaremos un código de 6 dígitos.</p>
    <form id="login-form" class="portal-form" novalidate>
      <label for="email">Correo</label>
      <input id="email" name="email" type="email" autocomplete="username" inputmode="email" required value="${escapeHtml(state.email || '')}">
      ${alert(state.error)}
      <button class="btn btn-primary" type="submit" ${state.busy ? 'disabled' : ''}>Enviar código</button>
    </form>
  </section>`;
}

export function renderCode(state) {
  const wait = state.secondsLeft > 0;
  return `<section class="portal-card">
    <p class="eyebrow">Código de acceso</p>
    <h1>Revise su correo</h1>
    <p>Si ese correo está invitado, le enviamos un código de 6 dígitos a <strong>${escapeHtml(state.email)}</strong>. Revise también el correo no deseado.</p>
    <form id="code-form" class="portal-form" novalidate>
      <label for="code">Código</label>
      <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="6" pattern="[0-9]{6}" required>
      ${alert(state.error)}
      <button class="btn btn-primary" type="submit" ${state.busy ? 'disabled' : ''}>Entrar</button>
    </form>
    <p class="portal-resend">
      <button type="button" class="btn btn-ghost" id="resend" ${wait || state.busy ? 'disabled' : ''}>Reenviar código</button>
      <span id="resend-left">${wait ? `Disponible en ${state.secondsLeft} s` : ''}</span>
    </p>
    <button type="button" class="portal-textbtn" id="change-email">Usar otro correo</button>
  </section>`;
}

function membresiaDe(state, socioId, anio) {
  return (state.membresias || []).find((m) => m.socioId === socioId && m.anio === anio);
}

export function renderSocio(state) {
  const hoy = state.hoy || hoyChihuahua();
  const year = Number(hoy.slice(0, 4));
  const years = [year, year + 1];
  if (!state.socios?.length) {
    return `<section class="portal-card">
      <h2>Su ficha</h2>
      <p>Su cuenta todavía no está ligada a un restaurante. La Sección hace ese vínculo al invitarlo. Si ya debería verlo, escríbanos.</p>
    </section>`;
  }
  const fichas = state.socios.map((socio) => {
    const estados = years.map((anio) => {
      const row = membresiaDe(state, socio.id, anio);
      const label = row ? ESTADO[row.estado] || row.estado : 'Sin registro';
      return `<li><span>${anio}</span> <strong>${escapeHtml(label)}</strong></li>`;
    }).join('');
    const base = socio.esSocioBase ? '<p class="portal-chip">Socio base: la cuota del año es completa.</p>' : '';
    return `<article class="portal-ficha">
      <h3>${escapeHtml(socio.nombre)}</h3>
      ${base}
      <ul class="portal-years">${estados}</ul>
    </article>`;
  }).join('');

  const historia = (state.renovaciones || []).length
    ? `<ul class="portal-history">${state.renovaciones.map((r) => `<li>
        <strong>${escapeHtml(ESTADO[r.estado] || r.estado)}</strong>
        · ${escapeHtml(formatFecha(r.fecha))} · membresía ${r.anio}
        · reportó ${escapeHtml(formatMxn(r.reportado))}
        ${r.esperado != null ? `· cuota ${escapeHtml(formatMxn(r.esperado))}` : ''}
        ${r.motivoRechazo ? `<span class="portal-why">Motivo: ${escapeHtml(r.motivoRechazo)}</span>` : ''}
      </li>`).join('')}</ul>`
    : '<p>Todavía no hay pagos reportados.</p>';

  const selectedSocio = state.socioId || state.socios[0]?.id;
  const socioOptions = state.socios.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === selectedSocio ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('');
  const fecha = state.fecha || hoy;
  const anio = state.anio || anioSugerido(fecha);
  const anioOptions = aniosPermitidos(fecha).map((n) => `<option value="${n}" ${Number(anio) === n ? 'selected' : ''}>${n}</option>`).join('');
  const metodo = state.metodo || 'transferencia';

  return `<section class="portal-card">
      <h2>Su membresía</h2>
      ${fichas}
    </section>
    <section class="portal-card">
      <h2>Reportar pago</h2>
      <p>Indique la fecha real del pago y el monto de su comprobante. La cuota la confirma el servidor; si no coincide, la Sección anota el motivo al aprobar.</p>
      <form id="pago-form" class="portal-form" novalidate>
        <label for="socio">Restaurante</label>
        <select id="socio" name="socio">${socioOptions}</select>
        <label for="fecha">Fecha del pago</label>
        <input id="fecha" name="fecha" type="date" required min="2026-01-01" max="${escapeHtml(hoy)}" value="${escapeHtml(fecha)}">
        <label for="anio">Año de la membresía</label>
        <select id="anio" name="anio">${anioOptions}</select>
        <label for="monto">Monto que aparece en su comprobante</label>
        <input id="monto" name="monto" inputmode="decimal" autocomplete="off" required placeholder="1200.00" value="${escapeHtml(state.monto || '')}">
        <label for="metodo">Forma de pago</label>
        <select id="metodo" name="metodo">
          <option value="transferencia" ${metodo === 'transferencia' ? 'selected' : ''}>Transferencia</option>
          <option value="efectivo" ${metodo === 'efectivo' ? 'selected' : ''}>Efectivo</option>
          <option value="otro" ${metodo === 'otro' ? 'selected' : ''}>Otra</option>
        </select>
        <label for="comprobante">Comprobante (JPG, PNG o PDF, hasta 10 MB)</label>
        <input id="comprobante" name="comprobante" type="file" accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf" required>
        <p id="esperado" class="portal-esperado">${escapeHtml(state.esperadoTexto || 'Elija la fecha para consultar la cuota.')}</p>
        ${alert(state.pagoError)}
        ${note(state.pagoNote)}
        <button class="btn btn-primary" type="submit" ${state.busy ? 'disabled' : ''}>Enviar aviso de pago</button>
      </form>
    </section>
    <section class="portal-card">
      <h2>Historial</h2>
      ${historia}
    </section>`;
}

export function renderAdmin(state) {
  const lectura = !state.puedeAprobar;
  const intro = lectura
    ? 'Puede consultar la cola. Aprobar y rechazar corresponde al tesorero o a la presidencia.'
    : 'La meta es resolver cada pago en 24 horas. Usted o la presidencia pueden decidirlo, cualquiera de los dos.';
  const cards = (state.pendientes || []).length
    ? state.pendientes.map((p) => {
      const propio = p.esPropio
        ? '<p class="portal-alert">Usted es socio de esta ficha. No puede aprobar ni rechazar este pago; corresponde al otro firmante.</p>'
        : '';
      const tarde = p.horas24 ? '<p class="portal-chip portal-chip-late">Lleva más de 24 horas</p>' : '';
      const link = p.comprobanteUrl
        ? `<p><a href="${escapeHtml(p.comprobanteUrl)}" rel="noopener">Descargar comprobante</a></p>`
        : '<p>Sin archivo de comprobante.</p>';
      const esperado = p.esperadoServidor == null ? 'El servidor no dio una cuota.' : formatMxn(p.esperadoServidor);
      const acciones = lectura || p.esPropio ? '' : `<form class="portal-form decide-form" data-id="${escapeHtml(p.id)}" data-fecha="${escapeHtml(p.fecha)}" data-reportado="${escapeHtml(p.reportado)}" data-esperado="${escapeHtml(p.esperadoServidor ?? '')}">
          <label>Corregir fecha <input type="date" name="fecha" min="2026-01-01" max="${escapeHtml(state.hoy)}" value="${escapeHtml(p.fecha)}"></label>
          <label>Monto distinto, si hace falta <input name="override" inputmode="decimal" placeholder="dejar la cuota del servidor"></label>
          <label>Motivo <textarea name="motivo" rows="2" placeholder="Hace falta si el monto o la fecha cambian la cuota, y siempre para rechazar."></textarea></label>
          <div class="portal-actions">
            <button class="btn btn-primary" type="submit" name="decision" value="aprobar">Aprobar</button>
            <button class="btn btn-ghost" type="submit" name="decision" value="rechazar">Rechazar</button>
          </div>
        </form>`;
      return `<article class="portal-ficha">
        <h3>${escapeHtml(p.socioNombre)}</h3>
        ${tarde}
        <p>${escapeHtml(formatFecha(p.fecha))} · membresía ${p.anio}${p.esSocioBase ? ' · socio base' : ''}</p>
        <p>Reportó ${escapeHtml(formatMxn(p.reportado))} · cuota del servidor ${escapeHtml(esperado)}</p>
        ${link}
        ${propio}
        ${acciones}
      </article>`;
    }).join('')
    : '<p>No hay pagos pendientes.</p>';
  return `<section class="portal-card">
    <h2>Pagos por revisar</h2>
    <p>${intro}</p>
    ${alert(state.adminError)}
    ${note(state.adminNote)}
    ${cards}
  </section>`;
}

export function renderProfile() {
  return `<section class="portal-card">
    <h2>Contraseña, si la desea</h2>
    <p>El código de correo sigue siendo la entrada. Si quiere, puede agregar una contraseña: mínimo 10 caracteres, con mayúscula, minúscula, dígito y símbolo.</p>
    <form id="password-form" class="portal-form" novalidate>
      <label for="password">Nueva contraseña</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required>
      <p id="password-msg" class="portal-note" role="status"></p>
      <button class="btn btn-ghost" type="submit">Guardar contraseña</button>
    </form>
  </section>`;
}

export function renderPortal(state) {
  if (state.screen === 'loading') {
    return '<section class="portal-card"><p role="status">Abriendo su sesión…</p></section>';
  }
  if (state.screen === 'code') return renderCode(state);
  if (state.screen !== 'app') return renderLogin(state);
  const roles = (state.roles || []).map((r) => ({
    socio: 'Socio',
    tesorero: 'Tesorero',
    presidente: 'Presidencia',
    admin_lectura: 'Consulta',
  }[r] || r)).join(' · ');
  const showSocio = (state.socios || []).length > 0 || (state.roles || []).includes('socio');
  const socioBlock = showSocio ? renderSocio(state) : '';
  const adminBlock = state.staff ? renderAdmin(state) : '';
  const empty = !socioBlock && !adminBlock
    ? '<section class="portal-card"><p>Su usuario todavía no tiene un rol. Pida a la Sección que lo asigne.</p></section>'
    : '';
  return `<div class="portal-bar">
      <p>Sesión de <strong>${escapeHtml(state.userEmail)}</strong>${roles ? ` · ${escapeHtml(roles)}` : ''}</p>
      <button type="button" class="btn btn-ghost" id="sign-out">Cerrar sesión</button>
    </div>
    ${socioBlock}
    ${adminBlock}
    ${renderProfile()}
    ${empty}`;
}

export function textoEsperado(preview) {
  if (!preview) return 'Elija la fecha para consultar la cuota.';
  if (preview.error) return preview.error;
  if (preview.monto == null) return 'Consultando la cuota…';
  let text = `Cuota que confirma el servidor: ${formatMxn(preview.monto)}.`;
  if (preview.local != null && Number(preview.local) !== Number(preview.monto)) {
    text += ' Usamos la cifra del servidor.';
  }
  return text;
}
