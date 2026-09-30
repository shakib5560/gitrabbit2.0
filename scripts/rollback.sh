#!/usr/bin/env bash
# ==============================================================================
# GitRabbit - Emergency Automated Rollback Script
# Reverts to previous container images (:rollback-latest) or restarts last good state
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
ROLLBACK_TAG="rollback-latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

log_warn "=========================================================="
log_warn "⚠️  Initiating GitRabbit Microservices Emergency Rollback..."
log_warn "=========================================================="

if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Compose file '$COMPOSE_FILE' not found."
    exit 1
fi

# Stop currently failing containers
log_info "Stopping current containers..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans || true

# Check if rollback images exist
ROLLBACK_IMAGES=$(docker images --filter "reference=*:${ROLLBACK_TAG}" -q)

if [[ -n "$ROLLBACK_IMAGES" ]]; then
    log_info "Found rollback tagged images. Retagging as current images..."
    for IMG in $ROLLBACK_IMAGES; do
        REPO=$(docker inspect --format='{{index .RepoTags 0}}' "$IMG" 2>/dev/null || true)
        if [[ -n "$REPO" ]]; then
            ORIGINAL_REPO="${REPO%%:${ROLLBACK_TAG}}"
            docker tag "$REPO" "${ORIGINAL_REPO}:latest" || true
            log_info "Restored ${ORIGINAL_REPO}:latest from ${ROLLBACK_TAG}"
        fi
    done
else
    log_warn "No :rollback-latest images found. Attempting to bring up existing images..."
fi

# Restart containers
log_info "Restarting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

log_success "Rollback command executed. Current container status:"
docker compose -f "$COMPOSE_FILE" ps
