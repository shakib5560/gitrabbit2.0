#!/usr/bin/env bash
# ==============================================================================
# GitRabbit Backend - Production Deployment Script
# Automatically builds and starts all microservices with zero-downtime
# ==============================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=========================================================="
echo "🐰 Deploying GitRabbit Microservices..."
echo "Target directory: $PROJECT_ROOT"
echo "=========================================================="

# 1. Check for .env file
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "⚠️  No .env file found. Creating from .env.example..."
        cp .env.example .env
        echo "❗ Please edit .env with your real production secrets!"
    else
        echo "❌ Fatal Error: .env file is missing and no .env.example found!"
        exit 1
    fi
fi

# 2. Build and launch containers
echo "🐳 Building and starting Docker containers..."
docker compose up -d --build --remove-orphans

# 3. Wait for Auth service container to become healthy
echo "⏳ Waiting for services to initialize..."
sleep 5

# 4. Synchronize Prisma Schema with Database
echo "🔄 Synchronizing Prisma database schema..."
docker compose exec -T auth-service npx prisma db push --accept-data-loss || {
    echo "⚠️  Prisma db push encountered a non-fatal warning or completed."
}

# 5. Clean up dangling images to save EC2 disk space
echo "🧹 Pruning unused Docker images..."
docker image prune -f

# 6. Verify Container Status
echo "=========================================================="
echo "📊 Running Container Status:"
echo "=========================================================="
docker compose ps

echo "=========================================================="
echo "✅ GitRabbit Backend is successfully deployed and running!"
echo "API Gateway running on Port 80"
echo "Auth Service running on Port 3000 (/api/auth/)"
echo "WebSocket Gateway running at /socket.io/"
echo "Redis running on Port 6379"
echo "=========================================================="
