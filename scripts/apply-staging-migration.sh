#!/usr/bin/env bash
# Apply one migration file to STAGING in a single transaction and record it in the ledger under
# the file's own version, so the file name and supabase_migrations.schema_migrations agree
# (the MCP apply tool stamps its own timestamp instead -- CLAUDE.md trap 7).
set -euo pipefail
cd "$(dirname "$0")/.."
f="$1"
base=$(basename "$f" .sql)
version="${base%%_*}"
name="${base#*_}"
tmp=$(mktemp -t mig).sql
{
  echo "begin;"
  cat "$f"
  echo ";"
  echo "insert into supabase_migrations.schema_migrations(version, name, statements)"
  echo "values ('$version', '$name', array[\$mig_body\$$(cat "$f")\$mig_body\$])"
  echo "on conflict (version) do nothing;"
  echo "commit;"
} > "$tmp"
scripts/staging-sql.sh "$tmp"
rm -f "$tmp"
echo "applied $version $name"
