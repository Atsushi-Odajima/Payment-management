#!/bin/sh
set -e

# Ensure the SQLite data dir exists when a volume is mounted at /data.
case "$DATABASE_URL" in
  file:/data/*)
    mkdir -p /data
    ;;
esac

echo "→ Applying database migrations…"
node node_modules/prisma/build/index.js migrate deploy

echo "→ Starting Next.js (standalone) on :${PORT:-3000}"
exec node server.js
