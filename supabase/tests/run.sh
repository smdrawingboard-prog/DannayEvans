#!/usr/bin/env bash
# Applies the shim and every migration to a scratch database, then runs the
# isolation and signature-lifecycle assertions. Exits non-zero on any failure.
set -euo pipefail

PGHOST="${PGHOST:-/tmp}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
export PGHOST PGPORT PGUSER

DB="hireframe_test_$$"
psql -q -d postgres -c "create database \"$DB\";"
trap 'psql -q -d postgres -c "drop database if exists \"$DB\" with (force);" >/dev/null' EXIT

run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql -q -d "$DB" -c "create extension if not exists pgcrypto;"
run "$ROOT/supabase/tests/_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "applying $(basename "$f")"
  run "$f"
done
run "$ROOT/supabase/tests/isolation_test.sql"
run "$ROOT/supabase/tests/pricing_test.sql"
run "$ROOT/supabase/tests/document_pack_test.sql"
run "$ROOT/supabase/tests/assessment_test.sql"
run "$ROOT/supabase/tests/onboarding_test.sql"
run "$ROOT/supabase/tests/outreach_test.sql"
run "$ROOT/supabase/tests/document_rules_test.sql"
run "$ROOT/supabase/tests/reporting_test.sql"
