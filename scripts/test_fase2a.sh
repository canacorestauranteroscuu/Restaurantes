#!/usr/bin/env bash
# Aplica el esquema de fase 2a en Postgres local y corre las pruebas SQL.
# No se conecta a ningún proyecto de Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${FASE2A_DB:-sercanaco_fase2a}"

# L5 + N2: el guardia ve minúsculas, IF EXISTS, nombres entre comillas,
# un GRANT partido, DROP POLICY, TRUNCATE, CREATE TRIGGER, search_path=storage
# seguido de un ALTER sin calificar, SQL dinámico y un hueco largo de espacios.
storage_ddl_res=(
  '(alter|grant|revoke|drop|comment)[[:space:]][\s\S]{0,200}?"?storage"?[[:space:]]*\.'
  '(alter|grant|revoke|drop|comment)[[:space:]]+(table[[:space:]]+)?(if[[:space:]]+exists[[:space:]]+)?"?storage"?[[:space:]]*\.'
  'truncate[[:space:]]+(table[[:space:]]+)?"?storage"?[[:space:]]*\.'
  'create[[:space:]]+trigger[\s\S]{0,800}?on[[:space:]]+"?storage"?[[:space:]]*\.'
  'set[[:space:]]+search_path[[:space:]]*=[[:space:]]*[\047"]?storage[\047"]?[[:space:]]*;[\s\S]{0,1500}?alter[[:space:]]+'
  '(execute|format)[[:space:]]*[\047"(][\s\S]{0,500}?storage'
)
storage_ddl_hit() {
  local sample="$1"
  local re
  for re in "${storage_ddl_res[@]}"; do
    if printf '%s' "$sample" | grep -Pzoi "$re" >/dev/null; then
      return 0
    fi
  done
  return 1
}
for re in "${storage_ddl_res[@]}"; do
  if grep -Pzoi "$re" "$ROOT/supabase/migrations/"*.sql; then
    echo "la migracion no puede alterar, otorgar ni tirar politicas en storage" >&2
    exit 1
  fi
done
long_ws="$(printf 'ALTER TABLE%250sstorage.objects ENABLE ROW LEVEL SECURITY;' '')"
storage_ddl_samples=(
  $'alter table storage.objects enable row level security;'
  $'ALTER TABLE IF EXISTS storage.objects ENABLE ROW LEVEL SECURITY;'
  $'ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;'
  $'GRANT\nSELECT ON storage.objects TO anon;'
  $'DROP POLICY comprobantes_socio_update ON storage.objects;'
  $'TRUNCATE storage.objects;'
  $'TRUNCATE TABLE "storage"."objects";'
  $'CREATE TRIGGER t BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION f();'
  $'CREATE TRIGGER t\nBEFORE UPDATE ON storage.objects\nFOR EACH ROW EXECUTE FUNCTION f();'
  $'SET search_path = storage;\nALTER TABLE objects ENABLE ROW LEVEL SECURITY;'
  $'SET search_path=storage; ALTER TABLE objects DISABLE ROW LEVEL SECURITY;'
  $'EXECUTE format('"'"'ALTER TABLE %I.objects ENABLE ROW LEVEL SECURITY'"'"', '"'"'storage'"'"');'
  $'EXECUTE '"'"'TRUNCATE TABLE storage.objects'"'"';'
  "$long_ws"
)
for sample in "${storage_ddl_samples[@]}"; do
  if ! storage_ddl_hit "$sample"; then
    echo "el guardia de storage no detecto: $sample" >&2
    exit 1
  fi
done
PSQL=(psql -v ON_ERROR_STOP=1)

if [[ -n "${DATABASE_URL:-}" ]]; then
  PSQL+=("$DATABASE_URL")
else
  PSQL+=(-d "$DB_NAME")
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    createdb "$DB_NAME"
  fi
  psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS private CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public;"
fi

"${PSQL[@]}" -f "$ROOT/supabase/tests/bootstrap.sql"
"${PSQL[@]}" -f "$ROOT/supabase/migrations/20261119180000_fase2a_schema.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/fase2a.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/fase2a_neg.sql"

# L1: dos inserts concurrentes no pueden pasar de 2 cuentas.
run_psql() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql -v ON_ERROR_STOP=1 "$DATABASE_URL" "$@"
  else
    psql -v ON_ERROR_STOP=1 -d "$DB_NAME" "$@"
  fi
}
run_psql -c "INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000c1','c1@example.test'),('00000000-0000-4000-8000-0000000000c2','c2@example.test'); INSERT INTO public.socios (id, nombre) VALUES ('10000000-0000-4000-8000-0000000000cc','Fonda Carrera'); INSERT INTO public.cuentas_socio (socio_id, user_id) VALUES ('10000000-0000-4000-8000-0000000000cc','00000000-0000-4000-8000-0000000000c1');"
# Cualquiera de las dos sesiones puede perder el candado y salir con error.
# El invariante es el conteo final, no qué sesión gana.
set +e
run_psql -c "BEGIN; INSERT INTO public.cuentas_socio (socio_id, user_id) VALUES ('10000000-0000-4000-8000-0000000000cc','00000000-0000-4000-8000-0000000000c2'); SELECT pg_sleep(2); COMMIT;" &
race_pid=$!
sleep 1
run_psql -c "INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000c4','c4@example.test'); INSERT INTO public.cuentas_socio (socio_id, user_id) VALUES ('10000000-0000-4000-8000-0000000000cc','00000000-0000-4000-8000-0000000000c4');"
fg_status=$?
wait "$race_pid"
bg_status=$?
set -e
race_n="$(run_psql -tAc "SELECT count(*) FROM public.cuentas_socio WHERE socio_id='10000000-0000-4000-8000-0000000000cc'")"
if [[ "$race_n" != "2" ]]; then
  echo "L1: la carrera dejo $race_n cuentas (fondo $bg_status, frente $fg_status), se esperaban 2" >&2
  exit 1
fi