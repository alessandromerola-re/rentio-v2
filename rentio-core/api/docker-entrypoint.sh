#!/usr/bin/env bash
set -euo pipefail

echo "[core-api] bootstrapping..."

DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"

# Readiness check intentionally does not require db/user envs: migrations run against DATABASE_URL.
for attempt in $(seq 1 60); do
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    echo "[core-api] postgres is ready"
    break
  fi

  if [[ "$attempt" == "60" ]]; then
    echo "[core-api] ERROR: postgres not ready after ${attempt} attempts"
    exit 1
  fi

  echo "[core-api] waiting for postgres (${attempt}/60)..."
  sleep 2
done

echo "[core-api] applying migrations"
npm run migrate:deploy

echo "[core-api] seeding data"
npm run seed

echo "[core-api] starting server"
exec "$@"
