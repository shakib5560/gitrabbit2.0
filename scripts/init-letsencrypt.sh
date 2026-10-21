#!/usr/bin/env bash
# ==============================================================================
# GitRabbit - Cold-Start Let's Encrypt SSL Bootstrap Script
# Obtains real Let's Encrypt certificates using Certbot in webroot mode.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="${1:-.env.production}"

# Safe environment variable reader (pure text parsing, prevents shell execution & injection)
get_env_val() {
    local key="$1"
    local file="${2:-$ENV_FILE}"
    local default_val="${3:-}"

    if [[ ! -f "$file" ]]; then
        printf '%s' "$default_val"
        return
    fi

    local val
    val=$(awk -v target="$key" '
        BEGIN { found = "" }
        {
            line = $0
            sub(/^[[:space:]]*export[[:space:]]+/, "", line)
            sub(/^[[:space:]]+/, "", line)
            if (line ~ /^#/ || line ~ /^[[:space:]]*$/) next
            eq_idx = index(line, "=")
            if (eq_idx > 0) {
                k = substr(line, 1, eq_idx - 1)
                sub(/[[:space:]]+$/, "", k)
                if (k == target) {
                    v = substr(line, eq_idx + 1)
                    sub(/^[[:space:]]+/, "", v)
                    if ((v ~ /^".*"$/ && length(v) >= 2) || (v ~ /^\x27.*\x27$/ && length(v) >= 2)) {
                        v = substr(v, 2, length(v) - 2)
                    } else {
                        sub(/[[:space:]]+$/, "", v)
                    }
                    found = v
                }
            }
        }
        END { printf "%s", found }
    ' "$file")

    if [[ -z "$val" ]]; then
        printf '%s' "$default_val"
    else
        printf '%s' "$val"
    fi
}

DOMAIN=$(get_env_val "DOMAIN_NAME" "$ENV_FILE" "api.gitrabbit.co")
EMAIL=$(get_env_val "MAIL_USER" "$ENV_FILE" "admin@gitrabbit.co")
STAGING=0 # Set to 1 for testing with Let's Encrypt staging environment

echo "=========================================================="
echo "🔒 GitRabbit Let's Encrypt SSL Certificate Setup"
echo "Domain: $DOMAIN"
echo "Email:  $EMAIL"
echo "=========================================================="

# 1. Create directory paths in volume
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
mkdir -p ./certbot/conf/live/$DOMAIN ./certbot/www

# 2. Check if certificate already exists
if docker run --rm -v gitrabbit-prod-certbot-etc:/etc/letsencrypt alpine test -d "$CERT_DIR"; then
    echo "✔ Certificate directory for $DOMAIN already exists in Docker volume."
    read -p "Do you want to force replace the existing certificate? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing certificate. Exiting."
        exit 0
    fi
fi

# 3. Create dummy certificate if real certificate does not exist yet
echo "Creating temporary fallback certificate so Nginx can start..."
docker run --rm \
  -v gitrabbit-prod-certbot-etc:/etc/letsencrypt \
  alpine sh -c "
    mkdir -p /etc/letsencrypt/live/$DOMAIN && \
    apk add --no-cache openssl && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
      -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
      -subj '/CN=localhost'
  "

# 4. Start Nginx Gateway
echo "Starting Nginx reverse proxy..."
docker compose -f docker-compose.prod.yml up -d api-gateway

# 5. Delete dummy certificate
echo "Removing temporary certificate..."
docker run --rm \
  -v gitrabbit-prod-certbot-etc:/etc/letsencrypt \
  alpine rm -Rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf

# 6. Request real certificate from Let's Encrypt
echo "Requesting genuine Let's Encrypt certificate from ACME server..."
STAGING_ARG=""
if [[ $STAGING -eq 1 ]]; then
    STAGING_ARG="--staging"
fi

docker run --rm \
  -v gitrabbit-prod-certbot-etc:/etc/letsencrypt \
  -v gitrabbit-prod-certbot-var:/var/lib/letsencrypt \
  -v gitrabbit-prod-certbot-www:/var/www/certbot \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  $STAGING_ARG \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  --rsa-key-size 4096 \
  --agree-tos \
  --force-renewal \
  --non-interactive

# 7. Reload Nginx
echo "Reloading Nginx with new production certificate..."
docker compose -f docker-compose.prod.yml exec api-gateway nginx -s reload

echo "=========================================================="
echo "🎉 SSL Certificate successfully provisioned and loaded!"
echo "HTTPS is active on: https://$DOMAIN"
echo "=========================================================="
