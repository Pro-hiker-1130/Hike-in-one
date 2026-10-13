#!/usr/bin/env bash
# Applies supabase/schema.sql + every migration (twice, to prove they're
# re-runnable) to a throwaway local Postgres, then runs tests/sql/*.test.sql.
# Needs PostgreSQL 14+ server binaries (initdb, pg_ctl) and psql.
#   PG_BIN=/usr/lib/postgresql/16/bin tests/run-sql-tests.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(pg_config --bindir 2>/dev/null || ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"
# initdb refuses to run as root; use the postgres account when we are root.
as_pg(){ if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
[ "$(id -u)" = 0 ] && chown postgres "$WORK"
as_pg "'$PG_BIN/initdb' -D '$WORK/data' -E UTF8 --locale=C.UTF-8 -A trust -U postgres >/dev/null"
as_pg "'$PG_BIN/pg_ctl' -D '$WORK/data' -o \"-p $PORT -k '$WORK' -c listen_addresses=''\" -l '$WORK/log' -w start >/dev/null"
cleanup(){ as_pg "'$PG_BIN/pg_ctl' -D '$WORK/data' -m fast stop >/dev/null" || true; rm -rf "$WORK"; }
trap cleanup EXIT
P=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)
"${P[@]}" -c "create database t"
"${P[@]}" -d t -f "$REPO/tests/sql/supabase-stub.sql"
"${P[@]}" -d t -f "$REPO/supabase/schema.sql"
for pass in 1 2; do
  for m in "$REPO"/supabase/migrations/*.sql; do "${P[@]}" -d t -f "$m" >/dev/null 2>&1 || "${P[@]}" -d t -f "$m"; done
done
echo "migrations applied twice (idempotent)"
for t in "$REPO"/tests/sql/*.test.sql; do
  "${P[@]}" -d t -f "$t" 2>&1 >/dev/null | sed 's/^psql:[^ ]* NOTICE:  //'
done
