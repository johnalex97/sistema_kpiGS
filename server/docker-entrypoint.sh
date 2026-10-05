#!/bin/sh
set -e

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL es obligatoria para iniciar la API." >&2
  exit 1
fi

node dist/src/scripts/prepare-evidence-storage.js
./node_modules/.bin/prisma migrate deploy
exec npm start
