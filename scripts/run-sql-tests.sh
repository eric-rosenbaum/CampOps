#!/usr/bin/env bash
# Runs SQL suites against STAGING through the Management API (no database password needed).
# Each suite is hermetic: it wraps itself in begin ... rollback, raises on the first failed
# assertion, and ends by selecting a one-row summary.
#   bash scripts/run-sql-tests.sh                 # every suite in supabase/tests/*_test.sql
#   bash scripts/run-sql-tests.sh food_requests   # suites whose name contains the word
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0
for f in supabase/tests/*_test.sql; do
  if [ -n "${1:-}" ] && [[ "$f" != *"$1"* ]]; then continue; fi
  echo "── $f"
  out=$(scripts/staging-sql.sh "$f" 2>&1)
  echo "$out" | grep -v "Initialising login role"
  if echo "$out" | grep -qiE "ERROR|FAIL|exception"; then fail=1; echo "✗ $f"; else echo "✓ $f"; fi
done
exit $fail
