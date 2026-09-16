#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
source .env.e2e
tmp=$(mktemp -t qa).sql
sed "s/__PASSWORD__/${E2E_PASSWORD}/" e2e/setup-qa-camp.sql > "$tmp"
scripts/staging-sql.sh "$tmp"
rm -f "$tmp"
