#!/usr/bin/env bash
# Apply ONE migration file to PRODUCTION in a single transaction, recording it in the ledger under
# the file's own version. Deliberately awkward to run:
#   - the checkout must be linked to production (the main checkout is; worktrees are staging),
#   - CONFIRM_PRODUCTION must equal the file's version,
#   - the version must not already be in production's ledger.
#
#   CONFIRM_PRODUCTION=20260917100000 scripts/apply-production-migration.sh supabase/migrations/20260917100000_….sql
set -euo pipefail
PROD_REF=fbfxeupqguzxrbyqojyg
cd "$(dirname "$0")/.."
f="$1"
base=$(basename "$f" .sql); version="${base%%_*}"; name="${base#*_}"
ref=$(cat supabase/.temp/project-ref 2>/dev/null || true)
[ "$ref" = "$PROD_REF" ] || { echo "refusing: linked to '$ref', not production ($PROD_REF)" >&2; exit 2; }
[ "${CONFIRM_PRODUCTION:-}" = "$version" ] || { echo "refusing: set CONFIRM_PRODUCTION=$version to apply $base to production" >&2; exit 2; }
already=$(supabase db query --linked --agent=no -o csv "select count(*) from supabase_migrations.schema_migrations where version = '$version'" 2>/dev/null | tail -1 | tr -d '"\r')
[ "$already" = "0" ] || { echo "refusing: $version is already in production's ledger" >&2; exit 2; }
tmp=$(mktemp -t mig).sql
{
  echo "begin;"; cat "$f"; echo ";"
  echo "insert into supabase_migrations.schema_migrations(version, name, statements)"
  echo "values ('$version', '$name', array[\$mig_body\$$(cat "$f")\$mig_body\$]);"
  echo "commit;"
} > "$tmp"
supabase db query --linked --agent=no -f "$tmp"
rm -f "$tmp"
echo "applied to PRODUCTION: $version $name"
