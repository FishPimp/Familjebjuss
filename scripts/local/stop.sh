#!/usr/bin/env bash
# Stoppar den lokala mini-Supabasen.
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.local-stack"
for svc in gateway postgrest auth functions; do
  if [ -f "$STATE/$svc.pid" ]; then
    kill "$(cat "$STATE/$svc.pid")" 2>/dev/null || true
    rm -f "$STATE/$svc.pid"
  fi
done
if [ -f "$STATE/pgdata/postmaster.pid" ]; then
  runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_ctl -D "$STATE/pgdata" -m fast stop >/dev/null 2>&1 || true
fi
echo "Stoppad."
