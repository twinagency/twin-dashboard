#!/usr/bin/env bash
# Isolated local rig for scripts/check-media-repair-db.ts: throwaway Postgres 17.6 + PostgREST in front of it (so the batch's REAL
# PostgREST filters and Supabase role behaviour are exercised). LOCAL ONLY: nothing here can reach Supabase, AWS or Telegram.
#   rig.sh up      start both containers, load fixture.sql (the existing shape, WITHOUT the new migration)
#   rig.sh down    stop and REMOVE both containers
# Ports 55445 (postgres) / 55444 (postgrest). 55433 is not used.
set -euo pipefail
PG=${MR_PG_NAME:-media-repair-pg17}; REST=${MR_REST_NAME:-media-repair-postgrest}; PGPORT=${MR_PG_PORT:-55445}; RESTPORT=${MR_REST_PORT:-55444}
HERE="$(cd "$(dirname "$0")" && pwd)"
SECRET="media-repair-local-secret-0123456789abcdef0123"
psqlx() { docker exec -i "$PG" psql -U postgres -v ON_ERROR_STOP=1 -q "$@"; }
case "${1:-}" in
  up)
    docker rm -f "$REST" "$PG" >/dev/null 2>&1 || true
    docker run -d --name "$PG" -p 127.0.0.1:$PGPORT:5432 -e POSTGRES_PASSWORD=mrlocal postgres:17.6 >/dev/null
    for i in $(seq 1 60); do docker exec "$PG" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    for i in $(seq 1 30); do psqlx -tAc "select 1" >/dev/null 2>&1 && psqlx -tAc "select 1" >/dev/null 2>&1 && break; sleep 1; done
    psqlx -o /dev/null < "$HERE/fixture.sql" 2>&1 | grep -v NOTICE || true
    psqlx <<'SQL'
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login password 'authpw' noinherit; end if; end $$;
grant anon, authenticated, service_role to authenticator;
SQL
    docker run -d --name "$REST" --network host \
      -e PGRST_DB_URI="postgres://authenticator:authpw@127.0.0.1:$PGPORT/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
      -e PGRST_JWT_SECRET="$SECRET" -e PGRST_SERVER_HOST=127.0.0.1 -e PGRST_SERVER_PORT=$RESTPORT postgrest/postgrest:latest >/dev/null
    for i in $(seq 1 30); do curl -s -m 2 -o /dev/null "http://127.0.0.1:$RESTPORT/" && break; sleep 1; done
    echo "rig up: $(docker exec "$PG" psql -U postgres -tAc 'select version()' | cut -c1-40) :$PGPORT, postgrest :$RESTPORT"
    ;;
  down) docker rm -f "$REST" "$PG" >/dev/null 2>&1 || true; echo "rig down" ;;
  psql) shift; psqlx "$@" ;;
  *) echo "usage: $0 up|down|psql" >&2; exit 2 ;;
esac
