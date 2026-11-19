function blob(error) {
  return `${error?.code || ''} ${error?.message || ''} ${error?.msg || ''} ${error?.error_code || ''}`.toLowerCase();
}

export function mapAuthError(error, phase) {
  const text = blob(error);
  if (
    text.includes('over_request_rate_limit')
    || text.includes('over_email_send_rate_limit')
    || text.includes('rate limit')
    || text.includes('too many')
  ) {
    return 'Demasiados intentos. Espere unos minutos antes de volver a intentarlo.';
  }
  if (phase === 'verify' && (text.includes('otp_expired') || text.includes('expired'))) {
    return 'El código venció. Solicite uno nuevo.';
  }
  if (phase === 'verify' && (text.includes('otp_invalid') || text.includes('invalid') || text.includes('token'))) {
    return 'El código no coincide. Revise los 6 dígitos e intente de nuevo.';
  }
  if (
    phase === 'send'
    && (
      text.includes('otp_disabled')
      || text.includes('signup')
      || text.includes('signups not allowed')
      || text.includes('user not found')
      || text.includes('not allowed')
      || text.includes('user_not_found')
    )
  ) {
    return 'No pudimos enviar el código. El acceso es solo por invitación de la Sección.';
  }
  if (phase === 'password' && (text.includes('weak') || text.includes('password'))) {
    return 'La contraseña no cumple la política del portal. Use al menos 10 caracteres, con mayúscula, minúscula, dígito y símbolo.';
  }
  if (phase === 'send') return 'No pudimos enviar el código. Intente de nuevo en un momento.';
  if (phase === 'verify') return 'No pudimos verificar el código. Intente de nuevo.';
  return 'No pudimos completar la solicitud. Intente de nuevo.';
}

const RPC_MAP = [
  ['no puede aprobar su propia renovacion', 'Usted es socio de esta ficha, así que no puede aprobar este pago. Corresponde al otro firmante.'],
  ['no puede rechazar su propia renovacion', 'Usted es socio de esta ficha, así que no puede rechazar este pago. Corresponde al otro firmante.'],
  ['ya hay una renovacion aprobada para ese año', 'Ese socio ya tiene una renovación aprobada para ese año.'],
  ['fecha_pago no puede ser futura', 'La fecha del pago no puede ser posterior a hoy en Chihuahua.'],
  ['la diferencia de monto requiere motivo', 'Ese cambio de monto necesita un motivo.'],
  ['requiere motivo', 'Escriba el motivo para continuar.'],
  ['monto invalido', 'El monto tiene que ser cero o más, con a lo más 2 decimales.'],
  ['solo tesorero o presidente pueden aprobar', 'Su usuario puede consultar, no aprobar.'],
  ['solo tesorero o presidente pueden rechazar', 'Su usuario puede consultar, no rechazar.'],
  ['la renovacion no esta pendiente', 'Ese pago ya no está pendiente.'],
  ['renovacion no encontrada', 'No encontramos ese pago.'],
  ['no hay cuota_anual', 'No hay una cuota configurada para ese año.'],
  ['no autorizado', 'No tiene permiso para consultar esa ficha.'],
];

export function mapRpcError(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  for (const [needle, copy] of RPC_MAP) {
    if (text.includes(needle)) return { needsMotivo: needle.includes('motivo'), message: copy };
  }
  return { needsMotivo: false, message: 'No pudimos registrar la decisión. Intente de nuevo.' };
}

export function motivoNecesario({ reportado, esperado, fechaOriginal, fechaNueva, override, esperadoNuevo }) {
  if (reportado != null && esperado != null && Number(reportado) !== Number(esperado)) return true;
  if (override != null && override !== '' && Number(override) !== Number(esperadoNuevo ?? esperado)) return true;
  if (fechaNueva && fechaOriginal && fechaNueva !== fechaOriginal && Number(esperadoNuevo) !== Number(esperado)) return true;
  return false;
}
