#!/bin/sh
set -e

# Ensure the SQLite data dir exists when a volume is mounted at /data.
case "$DATABASE_URL" in
  file:/data/*)
    mkdir -p /data
    ;;
esac

echo "→ Applying database migrations…"
npx prisma migrate deploy

echo "→ Starting Next.js on :$PORT"
exec npx next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
