#!/usr/bin/env bash

set -Eeuo pipefail

SERVICE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER_NAME="analyzer-postgres-test-$$"
DATABASE_NAME="grafana_ai_test"
DATABASE_USER="analyzer"
DATABASE_PASSWORD="test-password"

cleanup() {
  docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker run \
  --detach \
  --rm \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_DB="$DATABASE_NAME" \
  --env POSTGRES_USER="$DATABASE_USER" \
  --env POSTGRES_PASSWORD="$DATABASE_PASSWORD" \
  --publish 127.0.0.1::5432 \
  postgres:18.6-alpine >/dev/null

for _ in {1..30}; do
  if docker exec "$CONTAINER_NAME" pg_isready \
    --username "$DATABASE_USER" \
    --dbname "$DATABASE_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$CONTAINER_NAME" pg_isready \
  --username "$DATABASE_USER" \
  --dbname "$DATABASE_NAME" >/dev/null

MAPPED_ADDRESS="$(docker port "$CONTAINER_NAME" 5432/tcp)"
DATABASE_PORT="${MAPPED_ADDRESS##*:}"

cd "$SERVICE_DIR"
TEST_DATABASE_URL="postgresql://$DATABASE_USER:$DATABASE_PASSWORD@127.0.0.1:$DATABASE_PORT/$DATABASE_NAME" \
  pnpm exec vitest run test/postgres-event-store.test.ts
