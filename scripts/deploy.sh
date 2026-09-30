#!/usr/bin/env bash
# ==============================================================================
# GitRabbit - Production Zero-Downtime Microservices Deployment Engine
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
HEALTHCHECK_TIMEOUT="${HEALTHCHECK_TIMEOUT:-120}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/deploy-snapshots}"
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

echo "=========================================================="
echo "🐰 Starting GitRabbit Production Deployment"
echo "Project Root: $PROJECT_ROOT"
echo "Compose File: $COMPOSE_FILE"
echo "=========================================================="

# 1. Pre-flight Validation
log_info "Step 1/8: Validating deployment prerequisites..."
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed or not in PATH."
    exit 1
fi

if ! docker compose version &> /dev/null; then
    log_error "Docker Compose V2 is required."
    exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Production compose file '$COMPOSE_FILE' not found."
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f ".env" ]]; then
        log_warn "Target $ENV_FILE not found, falling back to .env"
        ENV_FILE=".env"
    else
        log_error "No environment file found (.env.production or .env). Refusing to deploy."
        exit 1
    fi
fi

# Disk space check
AVAIL_DISK_PERCENT=$(df -h / | awk 'NR==2 {print $5}' | tr -d '%')
if [[ "$AVAIL_DISK_PERCENT" -ge 90 ]]; then
    log_warn "Disk usage is high (${AVAIL_DISK_PERCENT}%). Pruning dangling images..."
    docker image prune -f || true
fi

# 2. Database Safety Snapshot
log_info "Step 2/8: Capturing pre-deployment database snapshots..."
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

capture_db_snapshot() {
    local service="$1"
    local db_user="$2"
    local db_name="$3"
    local outfile="${BACKUP_DIR}/${service}_${TIMESTAMP}.sql.gz"

    if docker compose -f "$COMPOSE_FILE" ps --services --filter "status=running" 2>/dev/null | grep -q "^${service}$"; then
        log_info "Creating snapshot for $service ($db_name)..."
        if docker compose -f "$COMPOSE_FILE" exec -T "$service" pg_dump -U "$db_user" "$db_name" 2>/dev/null | gzip > "$outfile"; then
            log_success "Snapshot saved: $outfile"
        else
            log_warn "Could not snapshot $service (container may be initializing or using different credentials)."
        fi
    fi
}

capture_db_snapshot "auth-db" "${AUTH_DB_USER:-postgres}" "${AUTH_DB_NAME:-auth_db}"
capture_db_snapshot "ai-db" "${AI_DB_USER:-postgres}" "${AI_DB_NAME:-ai_db}"
capture_db_snapshot "blog-postgres" "${BLOG_DB_USER:-postgres}" "${BLOG_DB_NAME:-blog_db}"

# 3. Snapshot Current Active Images for Rollback
log_info "Step 3/8: Tagging current active images for potential rollback..."
RUNNING_IMAGES=$(docker compose -f "$COMPOSE_FILE" images -q 2>/dev/null || true)
if [[ -n "$RUNNING_IMAGES" ]]; then
    for IMG in $RUNNING_IMAGES; do
        REPO=$(docker inspect --format='{{index .RepoTags 0}}' "$IMG" 2>/dev/null || true)
        if [[ -n "$REPO" && "$REPO" != "<none>:<none>" ]]; then
            REPO_NAME="${REPO%%:*}"
            docker tag "$REPO" "${REPO_NAME}:${ROLLBACK_TAG}" 2>/dev/null || true
        fi
    done
fi

# 4. Build Images with Docker BuildKit
log_info "Step 4/8: Building production images in parallel..."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --parallel; then
    log_error "Build failed! Deployment aborted. Existing services remain untouched."
    exit 2
fi

# Rollback Handler
perform_rollback() {
    log_error "=========================================================="
    log_error "🚨 HEALTH CHECK FAILED! Initiating Automated Rollback..."
    log_error "=========================================================="
    log_info "Recent container logs for diagnostics:"
    docker compose -f "$COMPOSE_FILE" logs --tail=60

    log_warn "Restoring previous stable container state..."
    "$SCRIPT_DIR/rollback.sh" || true
    exit 3
}

# 5. Launch Services in Detached Mode
log_info "Step 5/8: Deploying updated containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --remove-orphans

# 6. Healthcheck Polling and Verification Loop
log_info "Step 6/8: Monitoring container health checks (Timeout: ${HEALTHCHECK_TIMEOUT}s)..."
START_TIME=$(date +%s)

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [[ $ELAPSED -gt $HEALTHCHECK_TIMEOUT ]]; then
        log_error "Health checks timed out after ${HEALTHCHECK_TIMEOUT}s."
        perform_rollback
    fi

    # Check for dead / crashed containers
    CRASHED=$(docker compose -f "$COMPOSE_FILE" ps --filter "status=restarting" --filter "status=exited" -q)
    if [[ -n "$CRASHED" ]]; then
        sleep 4
        CONFIRMED_DEAD=$(docker compose -f "$COMPOSE_FILE" ps --filter "status=restarting" --filter "status=exited" -q)
        if [[ -n "$CONFIRMED_DEAD" ]]; then
            log_error "One or more containers crashed during startup."
            perform_rollback
        fi
    fi

    # Inspect all container health statuses
    ALL_HEALTHY=true
    CIDS=$(docker compose -f "$COMPOSE_FILE" ps -q)
    for CID in $CIDS; do
        STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$CID")
        NAME=$(docker inspect --format='{{.Name}}' "$CID" | tr -d '/')
        if [[ "$STATUS" == "starting" ]]; then
            ALL_HEALTHY=false
            break
        elif [[ "$STATUS" == "unhealthy" ]]; then
            log_error "Service '$NAME' entered UNHEALTHY state."
            perform_rollback
        fi
    done

    if [[ "$ALL_HEALTHY" == "true" ]]; then
        log_success "All service health checks PASSED ($ELAPSED seconds elapsed)."
        break
    fi

    sleep 3
done

# 7. Seamless Nginx Reload
log_info "Step 7/8: Seamlessly reloading Nginx reverse proxy..."
if docker compose -f "$COMPOSE_FILE" ps --services | grep -q "api-gateway"; then
    docker compose -f "$COMPOSE_FILE" exec -T api-gateway nginx -s reload 2>/dev/null || true
    log_success "Nginx proxy reloaded."
fi

# 8. Clean up Dangling Images & Display Status
log_info "Step 8/8: Cleaning up dangling build cache..."
docker image prune -f > /dev/null 2>&1 || true

echo ""
log_success "=========================================================="
log_success "✅ GitRabbit Microservices Deployed Successfully!"
log_success "=========================================================="
docker compose -f "$COMPOSE_FILE" ps
echo ""
log_info "Gateway Healthcheck: curl http://localhost/healthz"
log_info "Auth Healthcheck:    curl http://localhost/api/auth/health"
log_info "AI Healthcheck:      curl http://localhost/api/ai/health"
log_info "Blog Healthcheck:    curl http://localhost/api/blog/health"
echo "=========================================================="
