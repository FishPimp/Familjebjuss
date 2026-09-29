#!/usr/bin/env bash
# Kör databastesterna i supabase/tests mot den lokala mini-Supabasen.
# Varje testfil körs i en egen transaktion som rullas tillbaka efteråt.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PGPASSWORD=postgres
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -f "$ROOT/supabase/tests/00_helpers.sql" >/dev/null
status=0
for f in "$ROOT"/supabase/tests/[0-9][0-9]_*.test.sql; do
  echo "== $(basename "$f")"
  if out=$( { echo 'begin;'; cat "$f"; echo 'rollback;'; } | "${PSQL[@]}" -t -A 2>&1 ); then
    echo "$out" | grep -c '^ok:' | xargs -I{} echo "   {} kontroller gick igenom"
  else
    echo "$out" | grep -v '^ok:' | tail -5
    status=1
  fi
done
exit $status
