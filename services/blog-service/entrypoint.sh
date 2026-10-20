#!/usr/bin/env sh
set -e

echo "=========================================================="
echo "📝 Starting GitRabbit Blog Service..."
echo "=========================================================="

MIGRATION_SUCCESS=false
MAX_RETRIES=5

for i in $(seq 1 $MAX_RETRIES); do
  echo "📦 Running Prisma migrations (attempt $i/$MAX_RETRIES)..."
  if ./node_modules/.bin/prisma migrate deploy; then
    echo "✅ Database migrations applied successfully."
    MIGRATION_SUCCESS=true
    break
  else
    echo "⚠️ Migration attempt $i failed. Retrying in 3 seconds..."
    sleep 3
  fi
done

if [ "$MIGRATION_SUCCESS" = "false" ]; then
  echo "⚠️ Warning: Database migrations could not be completed after $MAX_RETRIES attempts. Proceeding with service startup..."
fi

echo "🚀 Starting Blog Fastify server on 0.0.0.0:4000..."
exec node dist/server.js
