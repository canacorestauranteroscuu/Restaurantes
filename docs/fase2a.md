# Fase 2a — esquema de socios, cuotas y comprobantes

Esquema de base para sercanaco.com. Este cambio no toca el sitio estático (`site/`) y no se aplica solo: no hay credenciales de Supabase en CI.

Proyecto destino, vacío, plan free, organización CANACO SER: `lynbusuqmexsehpvaqev`.

No aplicar este SQL en ningún otro proyecto. No vincular ni migrar `tntoamrzbjvpzyewjfig`.

Los 67 socios actuales se cargan después, desde Notion. Esta migración no los siembra. Los tests usan solo correos `@example.test` y nombres sintéticos.

## Orden para aplicarlo a mano

1. En el dashboard del proyecto `lynbusuqmexsehpvaqev`, dejar el alta pública cerrada: Auth → signups deshabilitados, sin anonymous sign-ins. El código de un solo uso es el de email (6 dígitos, plantilla `supabase/templates/magic_link.html`, variable `{{ .Token }}`). `supabase/config.toml` documenta los mismos valores para un stack local.
2. El cliente debe pedir el código con `shouldCreateUser: false`. Quien no esté invitado no crea cuenta. Después, si quiere, puede fijar una contraseña con `updateUser`; eso no cambia el esquema.
3. Aplicar únicamente `supabase/migrations/20261119180000_fase2a_schema.sql` en ese proyecto (`supabase db push` ya vinculado a ese ref, o el SQL editor de ese proyecto). No correr `supabase/tests/bootstrap.sql` ahí: `auth` y `storage` ya existen.
4. Invitar usuarios y asignar filas en `usuario_roles` y `cuentas_socio` con el rol de servicio. Como máximo dos cuentas por restaurante.
5. No sembrar socios reales en git.

## Tablas

| Tabla | Para qué |
| --- | --- |
| `usuario_roles` | Rol del usuario de Auth: `socio`, `tesorero`, `presidente`, `admin_lectura`. Un usuario puede tener más de un rol. No vive en `user_metadata`. |
| `socios` | Ficha del restaurante. `es_socio_base` lo marca la cuota completa en un alta. |
| `cuentas_socio` | Usuario de Auth ↔ socio. Máximo 2 por socio. |
| `cuota_anual` | Un renglón por año. 2027 = 1200 MXN. El cálculo lee esta tabla. |
| `membresias` | Un renglón por socio y año. `activa`, `vencida` o `en_revision`. Aprobar deja `activa` (eso alimenta después el “Pagado” de la ruleta). |
| `renovaciones` | `alta` o `renovacion`. El socio carga fecha, monto reportado, método y ruta del comprobante. Queda `pendiente`. |
| `auditoria` | Solo append: `aprobar`, `rechazar`, `cambio_monto`. Actor, antes, después, timestamp. |

`renovaciones_pendientes_24h` es una vista `security_invoker` para `/admin/renovaciones`: pendientes con más de 24 horas. Respeta el RLS de quien consulta.

## Regla de cuotas

`aprobar_renovacion` calcula `monto_esperado` en el servidor, con la cuota del año de `fecha_pago`:

- `renovacion`, o alta de un `es_socio_base`: la cuota entera de ese año.
- `alta` de quien no es base: `(cuota / 12) * (13 - mes de fecha_pago)`, redondeado a 2 decimales. Con 1200 MXN: enero 1200 … diciembre 100. El mes de la fecha de pago sí cuenta. El día en que alguien aprieta aprobar no cuenta.

El tesorero o el presidente pueden corregir `fecha_pago`. Pueden cambiar el monto solo si mandan un `motivo` no vacío; eso escribe `cambio_monto` y también `aprobar`. Rechazar exige motivo, deja `rechazada` y no activa la membresía.

Cualquiera de los dos basta. `admin_lectura` ve los datos de admin y no aprueba ni rechaza.

## RLS y funciones

`anon` no tiene privilegios sobre las tablas.

Un socio lee su ficha, sus cuentas, sus membresías y sus renovaciones. Inserta una renovación propia y no puede escribir `estado`, `monto_esperado`, `motivo_*` ni `aprobado_*`. No hay política de UPDATE/DELETE sobre `renovaciones`: esos campos solo los tocan las RPC.

Los tres roles de admin leen todo. `cuota_anual` la lee cualquier autenticado (es la tarifa, no un dato privado).

`auditoria` no tiene UPDATE ni DELETE para nadie, ni para el owner: un trigger lo impide. Los INSERT los hacen solo funciones `SECURITY DEFINER`.

Las funciones de autorización (`private.has_rol`, `es_lector_admin`, `puede_aprobar`, `socio_ids_propios`) son `SECURITY DEFINER` con `search_path = ''`. Leen `usuario_roles` / `cuentas_socio`, no metadata editable por el usuario.

La lógica de aprobar, rechazar y calcular vive en `private` (`SECURITY DEFINER`, `search_path = ''`) y revisa el rol con `auth.uid()` adentro. No hay funciones `SECURITY DEFINER` en el esquema expuesto. PostgREST solo publica `public`, así que tres wrappers `public.*` son `SECURITY INVOKER` con `search_path = ''` y delegan en `private`. `EXECUTE` está revocado a `PUBLIC` y otorgado solo a `authenticated`, en el wrapper y en la función de `private` que el wrapper necesita llamar. Una sesión SQL autenticada podría llamar `private.aprobar_renovacion` directo; el API no la publica, y la función igual exige tesorero o presidente.

## Storage

Bucket privado `comprobantes` (no público): jpeg, png o pdf, tope 10 MiB. Ruta `{socio_id}/{renovacion_id}/archivo`.

Políticas solo para `authenticated`. El socio sube y lee su carpeta. Tesorero, presidente y admin de lectura leen todo. No hay política para `public` ni para `anon`. Se sirven con URL firmada, no con un URL público del bucket.

## Cómo se prueban

`scripts/test_fase2a.sh` crea un Postgres local, aplica `supabase/tests/bootstrap.sql` (roles `anon` / `authenticated`, stub de `auth.uid()` y de `storage`) y luego la migración y `supabase/tests/fase2a.sql`. El workflow `.github/workflows/fase2a-db.yml` hace lo mismo contra el servicio `postgres:15`. No llama a Supabase hospedado.

Cubren: anon sin permiso, aislamiento entre dos socios, `admin_lectura` no aprueba, tesorero y presidente sí, prorrateo de los 12 meses más base y renovación, override sin motivo, corrección de fecha sin motivo, auditoría append-only, y la ruta del comprobante.

## Decisiones de seguridad

- Los roles no están en `raw_user_meta_data` ni en `user_metadata`.
- `auth.uid()` no se reemplaza en la migración. El bootstrap de tests solo existe para CI.
- El actor de una aprobación es `auth.uid()` dentro de la función, no un id que mande el cliente.
- `anon` no recibe `GRANT` de tablas ni de storage.
- `private` no está en `api.schemas`. El API solo ve wrappers `SECURITY INVOKER`. La función que escribe es `SECURITY DEFINER` en `private` y vuelve a exigir tesorero o presidente con `auth.uid()`, no con un id del cliente.
- Los roles no se leen de `app_metadata`. La tabla evita un JWT viejo: el cambio de rol vale en la siguiente consulta.
- `es_socio_base` y el vínculo cuenta↔socio no los puede reasignar `authenticated` ni `anon`.
- La cuota no está hardcodeada en la fórmula: sale de `cuota_anual`.
