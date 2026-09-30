#!/usr/bin/env bash
set -e

echo "=========================================================="
echo "🤖 Starting GitRabbit AI Service..."
echo "=========================================================="

# Run database migrations with retry mechanism (handles cloud DB cold starts)
MIGRATION_SUCCESS=false
MAX_RETRIES=5

for i in $(seq 1 $MAX_RETRIES); do
  echo "📦 Running database migrations (attempt $i/$MAX_RETRIES)..."
  if alembic upgrade head; then
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

echo "🚀 Starting Uvicorn on 0.0.0.0:8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips '*'
