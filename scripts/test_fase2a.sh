#!/usr/bin/env bash
# Aplica el esquema de fase 2a en Postgres local y corre las pruebas SQL.
# No se conecta a ningún proyecto de Supabase.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_NAME="${FASE2A_DB:-sercanaco_fase2a}"

if grep -nE 'ALTER TABLE storage\.|(GRANT|REVOKE)[[:space:]].*storage' "$ROOT/supabase/migrations/"*.sql; then
  echo "la migracion no puede alterar ni otorgar privilegios en storage (owner: supabase_storage_admin)" >&2
  exit 1
fi
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