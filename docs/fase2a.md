# Fase 2a — esquema de socios, cuotas y comprobantes

Esquema de base para sercanaco.com. No se aplica solo: no hay credenciales de servicio en CI. El portal estático vive en `/portal/`.

Proyecto destino, vacío, plan free, organización CANACO SER: `lynbusuqmexsehpvaqev`.

No aplicar este SQL en ningún otro proyecto. No vincular ni migrar `tntoamrzbjvpzyewjfig`.

Los 67 socios actuales se cargan después, desde Notion. Esta migración no los siembra. Los tests usan solo correos `@example.test` y nombres sintéticos.

## Orden para aplicarlo a mano

1. En el dashboard del proyecto `lynbusuqmexsehpvaqev`, dejar el alta pública cerrada: Auth → signups deshabilitados, sin anonymous sign-ins. El código de un solo uso es el de email (6 dígitos, plantilla `supabase/templates/magic_link.html`, variable `{{ .Token }}`). `supabase/config.toml` documenta los mismos valores para un stack local.
2. El cliente debe pedir el código con `shouldCreateUser: false`. Quien no esté invitado no crea cuenta. Después, si quiere, puede fijar una contraseña con `updateUser`; eso no cambia el esquema.
3. Aplicar únicamente `supabase/migrations/20261119180000_fase2a_schema.sql` en ese proyecto (`supabase db push` ya vinculado a ese ref, o el SQL editor de ese proyecto). No correr `supabase/tests/bootstrap.sql` ahí: `auth` y `storage` ya existen.
4. Invitar usuarios y asignar filas en `usuario_roles` y `cuentas_socio` con el rol de servicio. Como máximo dos cuentas por restaurante.
5. No sembrar socios reales en git. Cuando se carguen los 67 desde Notion, `es_socio_base` queda en true exactamente en esas 67 fichas. Después, `SELECT count(*) FROM public.socios WHERE es_socio_base` tiene que devolver 67. Si falta una, esa ficha se cobra como alta prorrateada.

## Tablas

| Tabla | Para qué |
| --- | --- |
| `usuario_roles` | Rol del usuario de Auth: `socio`, `tesorero`, `presidente`, `admin_lectura`. Un usuario puede tener más de un rol. No vive en `user_metadata`. |
| `socios` | Ficha del restaurante. `es_socio_base` lo marca la cuota completa en un alta. |
| `cuentas_socio` | Usuario de Auth ↔ socio. Máximo 2 por socio. |
| `cuota_anual` | Un renglón por año. 2027 = 1200 MXN. El cálculo lee esta tabla. |
| `membresias` | Un renglón por socio y año. `activa`, `vencida` o `en_revision`. Aprobar deja `activa` (eso alimenta después el “Pagado” de la ruleta). |
| `renovaciones` | El socio carga `anio`, fecha, monto reportado, método y ruta del comprobante. El servidor fija `alta` o `renovacion`. Queda `pendiente`. |
| `auditoria` | Solo append: `aprobar`, `rechazar`, `cambio_monto`. Actor, antes, después, timestamp. |

`renovaciones_pendientes_24h` es una vista `security_invoker` para `/admin/renovaciones`: pendientes con más de 24 horas. Respeta el RLS de quien consulta.

## Regla de cuotas

`aprobar_renovacion` calcula `monto_esperado` en el servidor, con la cuota de `renovaciones.anio` (no con el año de `fecha_pago`). Así un pago de diciembre 2026 puede ser la membresía 2027.

El tipo también lo fija el servidor: `renovacion` si `es_socio_base` o si ya hay un año anterior aprobado (`membresias` activa o vencida, o una renovación `aprobada`). Si no, `alta`. Un socio base o con historial nunca queda como alta.

- `renovacion`, o un `alta` cuya fecha cae en otro año: la cuota entera de `anio`.
- `alta` del mismo año: `round(cuota * (13 - mes) / 12, 2)`, un solo redondeo. Con 1200 MXN: enero 1200 … diciembre 100. El mes de `fecha_pago` sí cuenta. El día en que alguien aprieta aprobar no cuenta.

`fecha_pago` tiene que caer entre 2026-01-01 y 2036-12-31, y `anio` es ese año o el siguiente. Tampoco puede ser posterior a hoy en `America/Chihuahua`: lo rechaza el trigger de INSERT y `aprobar_renovacion`, también si quien aprueba cambia la fecha. No es un CHECK, porque `current_date` no es immutable.

Hay una sola renovación `aprobada` por socio y año. Una segunda aprobación responde «ya hay una renovacion aprobada para ese año»; el índice único sigue siendo el cierre si dos sesiones llegan juntas.

Si el monto final no es el `monto_reportado`, si el override no es la cuota, o si corregir `fecha_pago` mueve la cuota, hace falta un `motivo` y queda una fila `cambio_monto`. Un monto negativo o con más de 2 decimales se rechaza.

Quien aprueba no puede ser socio de esa ficha. Tesorero o presidente, cualquiera de los dos. `admin_lectura` ve y no aprueba. Rechazar exige motivo, deja `rechazada` y no activa la membresía. Aprobar deja la membresía de `anio` en `activa`.

## RLS y funciones

`anon` no tiene privilegios sobre las tablas.

Un socio lee su ficha, sus cuentas, sus membresías y sus renovaciones. Inserta una renovación propia y no puede escribir `estado`, `monto_esperado`, `motivo_*` ni `aprobado_*`. No hay política de UPDATE/DELETE sobre `renovaciones`: esos campos solo los tocan las RPC.

Los tres roles de admin leen todo. `cuota_anual` la lee cualquier autenticado (es la tarifa, no un dato privado).

`auditoria` no tiene UPDATE ni DELETE para nadie, ni para el owner: un trigger lo impide. Los INSERT los hacen solo funciones `SECURITY DEFINER`.

Las funciones de autorización (`private.has_rol`, `es_lector_admin`, `puede_aprobar`, `socio_ids_propios`) son `SECURITY DEFINER` con `search_path = ''`. Leen `usuario_roles` / `cuentas_socio`, no metadata editable por el usuario.

La lógica de aprobar, rechazar y calcular vive en `private` (`SECURITY DEFINER`, `search_path = ''`) y revisa el rol con `auth.uid()` adentro. No hay funciones `SECURITY DEFINER` en el esquema expuesto. PostgREST solo publica `public`, así que tres wrappers `public.*` son `SECURITY INVOKER` con `search_path = ''` y delegan en `private`. `EXECUTE` está revocado a `PUBLIC` y otorgado solo a `authenticated`, en el wrapper y en la función de `private` que el wrapper necesita llamar. Una sesión SQL autenticada podría llamar `private.aprobar_renovacion` directo; el API no la publica, y la función igual exige tesorero o presidente.

## Storage

Bucket privado `comprobantes` (no público): jpeg, png o pdf, tope 10 MiB. Ruta `{socio_id}/{renovacion_id}/archivo`.

`storage.objects` y `storage.buckets` son de `supabase_storage_admin`. La migración no hace `ALTER`, `GRANT` ni `REVOKE` en ese esquema: `postgres` no es el dueño y el apply se revierte entero. RLS ya está activo en el proyecto. Lo que sí crea la migración son las políticas.

Políticas solo de lectura e inserción para `authenticated`. No hay UPDATE ni DELETE: el comprobante no se reescribe. El INSERT exige que la renovación siga `pendiente`, que la primera carpeta sea el `socio_id` de esa fila y que la extensión sea jpg, jpeg, png o pdf. Si el objeto trae `metadata.mimetype`, tiene que ser `image/jpeg`, `image/png` o `application/pdf`.

El socio sube y lee su carpeta. Tesorero, presidente y admin de lectura leen todo. No hay política para `public` ni para `anon`, así que el rol anónimo no ve filas aunque la plataforma le deje privilegio de tabla. Se abren con URL firmada y disposición `download`, no en línea.

El frontend sube con `upsert: false`. No hay política de UPDATE, así que un reintento usa otro nombre de archivo.

## Cómo se prueban

`scripts/test_fase2a.sh` crea un Postgres local, aplica `supabase/tests/bootstrap.sql` (roles `anon` / `authenticated`, stub de `auth.uid()` y de `storage`) y luego la migración y `supabase/tests/fase2a.sql`. El workflow `.github/workflows/fase2a-db.yml` hace lo mismo contra `postgres:17` fijado por digest. No llama a Supabase hospedado.

Cubren: anon sin permiso, aislamiento entre dos socios, `admin_lectura` no aprueba, tesorero y presidente sí, prorrateo de los 12 meses más base y renovación, override sin motivo, corrección de fecha sin motivo, auditoría append-only, y la ruta del comprobante.

## Decisiones de seguridad

- Los roles no están en `raw_user_meta_data` ni en `user_metadata`.
- `auth.uid()` no se reemplaza en la migración. El bootstrap de tests solo existe para CI.
- El actor de una aprobación es `auth.uid()` dentro de la función, no un id que mande el cliente.
- `anon` no recibe `GRANT` sobre las tablas de `public`. En `storage` no se revoca el privilegio de la plataforma; no hay política para `anon` ni para `public`.
- La migración no altera ni otorga privilegios sobre `storage.*`. Ese esquema es de `supabase_storage_admin`.
- `private` no está en `api.schemas`. El API solo ve wrappers `SECURITY INVOKER`. La función que escribe es `SECURITY DEFINER` en `private` y vuelve a exigir tesorero o presidente con `auth.uid()`, no con un id del cliente.
- Los roles no se leen de `app_metadata`. La tabla evita un JWT viejo: el cambio de rol vale en la siguiente consulta.
- `es_socio_base` y el vínculo cuenta↔socio no los puede reasignar `authenticated` ni `anon`.
- La cuota no está hardcodeada en la fórmula: sale de `cuota_anual` para `anio`.
- Un tesorero o presidente que también es socio de esa ficha no aprueba ni rechaza ese pago.
- `auditoria` tampoco se puede truncar. `service_role` no tiene TRUNCATE, UPDATE ni DELETE.
- `anon` no ejecuta las tres funciones públicas, aunque el proyecto le dé EXECUTE por default privileges. Tampoco usa la secuencia de `auditoria`.
- `fecha_pago` no puede ser posterior a hoy en Chihuahua. El socio no elige un mes que todavía no llega para bajar la cuota.
- Los 67 de Notion se cargan con `es_socio_base = true`, y el conteo de esa columna tiene que ser 67.
- El comprobante se sube con `upsert: false`.

## Dashboard antes del go-live

`config.toml` no se aplica solo al proyecto hospedado. Antes de abrir el login, en `lynbusuqmexsehpvaqev`:

1. Signups apagados.
2. Anonymous sign-ins apagados.
3. OTP de 6 dígitos y caducidad de a lo más 900 segundos.
4. Plantillas Magic Link e Invite con `{{ .Token }}` (`supabase/templates/magic_link.html` y `supabase/templates/invite.html`), no un enlace.
5. SMTP propio. El correo integrado de Supabase solo llega al equipo del proyecto.
6. Site URL `https://sercanaco.com`. Allowlist de redirects solo `https://sercanaco.com/**`.
7. Rate limits de auth (envío de correo, verificación de OTP y sign-ins).
8. Contraseña mínima de 10, con mayúsculas, minúsculas, dígitos y símbolo, y secure password change. La protección de contraseñas filtradas pide plan Pro: en el plan free no está.
9. El API expone solo `public` y `graphql_public`. `private` no va en esa lista.
10. Después del apply, el bucket `comprobantes` queda privado, 10 MiB, y solo jpeg, png y pdf. `anon` no ejecuta `aprobar_renovacion`.

## Portal

`/portal/` es una página estática. El cliente vendido es `@supabase/supabase-js` 2.119.2 (`site/assets/vendor/supabase.js`). La URL y la clave publicable viven en `site/assets/portal/config.mjs`. No hay clave de servicio en el repo.

El login pide el correo y luego el código de 6 dígitos: `signInWithOtp` con `shouldCreateUser: false` y `verifyOtp` con `type: 'email'`. No consume un enlace mágico (`detectSessionInUrl: false`). La sesión queda solo en la clave que escribe supabase-js. Cerrar sesión llama `signOut`.

Quien tiene ficha ve su membresía del año en curso y del siguiente, su historial y el aviso de pago. La cuota que se muestra sale de `calcular_monto_esperado`; el cálculo local es la misma fórmula y no sustituye al servidor. El archivo se valida en el navegador (JPG, PNG o PDF, hasta 10 MB) y se sube después de insertar la fila, con `upsert: false` y un nombre nuevo. Si el archivo no se guarda, el aviso queda pendiente y hay que enviar otro: no se puede reescribir.

Tesorero y presidente ven la cola pendiente, abren el comprobante con URL firmada de descarga y deciden por `aprobar_renovacion` / `rechazar_renovacion`. Si el RPC pide motivo, el formulario lo pide. Un pago de la propia ficha no muestra los botones y, si igual llega, el error se explica. `admin_lectura` ve la cola y no decide. La contraseña es opcional, en el perfil, con la misma política de 10 caracteres y cuatro clases.

El enlace «Socios» del menú es el único cambio en las páginas públicas. La lista del dashboard de arriba sigue haciendo falta para que el código llegue de verdad.
