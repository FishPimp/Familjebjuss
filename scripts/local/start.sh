#!/usr/bin/env bash
# Startar en lokal mini-Supabase för utveckling och automatiska tester.
# Kräver: PostgreSQL 16 + PostGIS (+ pg_cron) installerat, Node 22.
# Laddar ner Supabase Auth och PostgREST första gången.
#
#   bash scripts/local/start.sh          # starta (och bygg om databasen från migreringarna)
#   bash scripts/local/stop.sh           # stoppa
#
# Skriver ut VITE_SUPABASE_URL och nyckeln att använda i .env.local.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATE="$ROOT/.local-stack"
BIN="$STATE/bin"
PGBIN="/usr/lib/postgresql/16/bin"
PGDATA="$STATE/pgdata"
PGPORT=54322
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
export PGPASSWORD=postgres

mkdir -p "$STATE" "$BIN" "$STATE/storage" "$STATE/logs"
touch "$STATE/logs/postgres.log" && chown postgres:postgres "$STATE/logs/postgres.log"
chmod 755 "$STATE"

# --- binärer ---
if [ ! -x "$BIN/postgrest" ]; then
  echo "Laddar ner PostgREST..."
  curl -sSL -o "$BIN/pgrst.tar.xz" https://github.com/PostgREST/postgrest/releases/download/v12.2.3/postgrest-v12.2.3-linux-static-x64.tar.xz
  tar -xf "$BIN/pgrst.tar.xz" -C "$BIN" && rm "$BIN/pgrst.tar.xz"
fi
if [ ! -x "$BIN/auth" ]; then
  echo "Laddar ner Supabase Auth..."
  curl -sSL -o "$BIN/auth.tgz" https://github.com/supabase/auth/releases/download/v2.180.0/auth-v2.180.0-x86.tar.gz
  tar -xzf "$BIN/auth.tgz" -C "$BIN" && rm "$BIN/auth.tgz"
fi
if [ ! -d "$ROOT/scripts/local/node_modules" ]; then
  (cd "$ROOT/scripts/local" && npm install --silent)
fi

bash "$ROOT/scripts/local/stop.sh" >/dev/null 2>&1 || true

# --- Postgres (ny, tom databas varje gång) ---
rm -rf "$PGDATA"
mkdir -p "$PGDATA" && chown postgres:postgres "$PGDATA"
runuser -u postgres -- "$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
cat >> "$PGDATA/postgresql.conf" <<EOF
port = $PGPORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '/tmp'
shared_preload_libraries = 'pg_cron'
cron.database_name = 'postgres'
timezone = 'UTC'
wal_level = logical
EOF
runuser -u postgres -- "$PGBIN/pg_ctl" -D "$PGDATA" -l "$STATE/logs/postgres.log" -w start >/dev/null
PSQL=(psql -h 127.0.0.1 -p $PGPORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q)
"${PSQL[@]}" -f "$ROOT/scripts/local/bootstrap.sql"

# --- Supabase Auth (skapar auth-schemat) ---
(
  cd "$BIN"
  env \
    GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_API_PORT=9999 \
    API_EXTERNAL_URL=http://localhost:54321/auth/v1 \
    GOTRUE_DB_DRIVER=postgres \
    GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@127.0.0.1:$PGPORT/postgres" \
    GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations" \
    GOTRUE_SITE_URL=http://localhost:5173 GOTRUE_URI_ALLOW_LIST='*' \
    GOTRUE_DISABLE_SIGNUP=false \
    GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_JWT_AUD=authenticated \
    GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_EXP=3600 \
    GOTRUE_JWT_SECRET="$JWT_SECRET" \
    GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=false \
    GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 \
    GOTRUE_SMTP_ADMIN_EMAIL=noreply@bjuss.local GOTRUE_SMTP_SENDER_NAME=Bjuss \
    GOTRUE_SMTP_MAX_FREQUENCY=1s GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 \
    GOTRUE_RATE_LIMIT_VERIFY=10000 GOTRUE_RATE_LIMIT_OTP=10000 \
    GOTRUE_MAILER_OTP_EXP=3600 GOTRUE_MAILER_OTP_LENGTH=6 \
    GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://localhost:54321/__templates/magic_link.html \
    GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://localhost:54321/__templates/confirmation.html \
    GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="Din kod till Bjuss" \
    GOTRUE_MAILER_SUBJECTS_CONFIRMATION="Din kod till Bjuss" \
    GOTRUE_LOG_LEVEL=warn \
    nohup ./auth > "$STATE/logs/auth.log" 2>&1 &
  echo $! > "$STATE/auth.pid"
)
for i in $(seq 1 60); do
  if "${PSQL[@]}" -tAc "select to_regprocedure('auth.uid()') is not null and exists(select 1 from pg_tables where schemaname='auth' and tablename='one_time_tokens')" 2>/dev/null | grep -q t; then break; fi
  sleep 0.5
done

# --- våra migreringar, i ordning (SKIP_MIGRATIONS=1 hoppar över, t.ex. för att testa "supabase db push") ---
for f in "$ROOT"/supabase/migrations/*.sql; do
  [ "${SKIP_MIGRATIONS:-}" = "1" ] && break
  [ -e "$f" ] || continue
  echo "Kör migrering $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

# --- PostgREST ---
cat > "$STATE/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:postgres@127.0.0.1:$PGPORT/postgres"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, extensions"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 3000
EOF
nohup "$BIN/postgrest" "$STATE/postgrest.conf" > "$STATE/logs/postgrest.log" 2>&1 &
echo $! > "$STATE/postgrest.pid"

# --- gateway + låtsas-SMTP ---
JWT_SECRET="$JWT_SECRET" STORAGE_DIR="$STATE/storage" TEMPLATE_DIR="$ROOT/supabase/templates" \
  nohup node "$ROOT/scripts/local/gateway.mjs" > "$STATE/logs/gateway.log" 2>&1 &
echo $! > "$STATE/gateway.pid"

# --- Edge Functions via Deno (med låtsas-Claude) ---
DENO="$(command -v deno || true)"
if [ -z "$DENO" ]; then
  if [ ! -x "$STATE/deno/node_modules/.bin/deno" ]; then
    mkdir -p "$STATE/deno" && (cd "$STATE/deno" && npm init -y >/dev/null && npm install deno --silent)
  fi
  DENO="$STATE/deno/node_modules/.bin/deno"
fi
ANON_FOR_FN=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'anon',iss:'supabase-local',iat:1700000000,exp:2000000000});
console.log(h+'.'+p+'.'+c.createHmac('sha256','$JWT_SECRET').update(h+'.'+p).digest('base64url'))")
(
  cd "$ROOT/supabase/functions"
  SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY="$ANON_FOR_FN" \
  ANTHROPIC_API_KEY=test-key ANTHROPIC_BASE_URL=http://127.0.0.1:54321/__anthropic \
    nohup "$DENO" run --allow-net --allow-env --allow-read --node-modules-dir=none --config deno.json \
    "$ROOT/scripts/local/functions.ts" > "$STATE/logs/functions.log" 2>&1 &
  echo $! > "$STATE/functions.pid"
)

for i in $(seq 1 40); do
  curl -sf http://127.0.0.1:54321/__health >/dev/null 2>&1 && curl -sf http://127.0.0.1:3000/ >/dev/null 2>&1 && break
  sleep 0.5
done

ANON=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'anon',iss:'supabase-local',iat:1700000000,exp:2000000000});
console.log(h+'.'+p+'.'+c.createHmac('sha256','$JWT_SECRET').update(h+'.'+p).digest('base64url'))")
SERVICE=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'}),p=b({role:'service_role',iss:'supabase-local',iat:1700000000,exp:2000000000});
console.log(h+'.'+p+'.'+c.createHmac('sha256','$JWT_SECRET').update(h+'.'+p).digest('base64url'))")
echo "$ANON" > "$STATE/anon.key"
echo "$SERVICE" > "$STATE/service.key"

echo ""
echo "Lokal Supabase kör:"
echo "  VITE_SUPABASE_URL=http://localhost:54321"
echo "  VITE_SUPABASE_PUBLISHABLE_KEY=$ANON"
