#!/usr/bin/env bash
# Run a SQL file (or inline SQL with -c) against STAGING through the Supabase Management API.
#
# Refuses to run unless this checkout's CLI link points at campcommand-staging. The main checkout
# has historically been linked to production, and `db query --linked` does whatever the link says.
set -euo pipefail
STAGING_REF=mvxnpofopbmljzpgnycg
cd "$(dirname "$0")/.."
ref=$(cat supabase/.temp/project-ref 2>/dev/null || true)
if [ "$ref" != "$STAGING_REF" ]; then
  echo "refusing: this checkout is linked to '$ref', not staging ($STAGING_REF)." >&2
  echo "run: supabase link --project-ref $STAGING_REF" >&2
  exit 2
fi
if [ "${1:-}" = "-c" ]; then
  supabase db query --linked --agent=no -o "${OUT:-table}" "$2" 2>&1 | grep -v "new version of Supabase CLI\|We recommend updating"
else
  supabase db query --linked --agent=no -o "${OUT:-table}" -f "$1" 2>&1 | grep -v "new version of Supabase CLI\|We recommend updating"
fi
