#!/bin/sh
# Run pending DB migrations, then hand off to the server (or whatever
# command was passed to the container). Idempotent: sequelize-cli skips
# migrations that are already in SequelizeMeta.
set -e

echo "==> Running database migrations..."
node ./node_modules/sequelize-cli/lib/sequelize db:migrate \
  --migrations-path dist/src/db/migrations \
  --config dist/src/config/database.js \
  --models-path dist/src/app/models

echo "==> Migrations done. Starting: $@"
exec "$@"
