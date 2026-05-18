#!/bin/sh
set -e

echo "[entrypoint] Applying Prisma migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma

echo "[entrypoint] Starting backend..."
exec node dist/index.js
