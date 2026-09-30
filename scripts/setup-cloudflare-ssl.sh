#!/usr/bin/env bash
# ==============================================================================
# GitRabbit - Cloudflare SSL Setup Helper
# Configures Cloudflare Origin CA Certificates or Self-Signed Fallback for Nginx
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CERTS_DIR="$PROJECT_ROOT/gateway/certs"
mkdir -p "$CERTS_DIR"

DOMAIN="${DOMAIN:-api.gitrabbit.co}"
SERVER_IP="${SERVER_IP:-3.110.66.16}"

echo "=========================================================="
echo "☁️  GitRabbit - Cloudflare SSL Configuration"
echo "Domain:    $DOMAIN"
echo "Server IP: $SERVER_IP"
echo "Certs Dir: $CERTS_DIR"
echo "=========================================================="
echo "Choose an option:"
echo "1) I have a Cloudflare Origin CA Certificate (Recommended for Full Strict mode)"
echo "2) Generate / regenerate a 10-Year Self-Signed Certificate (For Full mode)"
echo "3) Exit"
echo ""

read -p "Select option [1-3]: " -n 1 -r OPTION
echo ""

case "$OPTION" in
    1)
        echo "----------------------------------------------------------"
        echo "Instructions for Cloudflare Origin CA Certificate:"
        echo "1. Go to Cloudflare Dashboard -> SSL/TLS -> Origin Server"
        echo "2. Click 'Create Certificate' (keep defaults: RSA 2048, 15 years)"
        echo "3. Copy the 'Origin Certificate' and paste it into:"
        echo "   $CERTS_DIR/fullchain.pem"
        echo "4. Copy the 'Private Key' and paste it into:"
        echo "   $CERTS_DIR/privkey.pem"
        echo "----------------------------------------------------------"
        read -p "Press Enter once you have saved both files to reload Nginx..."

        if [[ -f "$CERTS_DIR/fullchain.pem" && -f "$CERTS_DIR/privkey.pem" ]]; then
            chmod 600 "$CERTS_DIR/privkey.pem" "$CERTS_DIR/fullchain.pem"
            echo "✔ Certificates detected."
            if docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" ps --services 2>/dev/null | grep -q "api-gateway"; then
                echo "Reloading Nginx..."
                docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec api-gateway nginx -s reload || true
            fi
            echo "🎉 Cloudflare Origin Certificate is now active!"
        else
            echo "❌ Error: $CERTS_DIR/fullchain.pem or privkey.pem was not found."
            exit 1
        fi
        ;;
    2)
        echo "Generating 10-year self-signed SSL certificate with SAN..."
        openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
          -keyout "$CERTS_DIR/privkey.pem" \
          -out "$CERTS_DIR/fullchain.pem" \
          -subj "/CN=$DOMAIN" \
          -addext "subjectAltName=DNS:$DOMAIN,IP:$SERVER_IP,DNS:localhost"

        chmod 600 "$CERTS_DIR/privkey.pem" "$CERTS_DIR/fullchain.pem"
        echo "✔ Self-signed certificate generated."

        if docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" ps --services 2>/dev/null | grep -q "api-gateway"; then
            echo "Reloading Nginx..."
            docker compose -f "$PROJECT_ROOT/docker-compose.prod.yml" exec api-gateway nginx -s reload || true
        fi

        echo "----------------------------------------------------------"
        echo "Note for Cloudflare:"
        echo "Set your Cloudflare SSL/TLS encryption mode to 'Full' in the"
        echo "Cloudflare Dashboard (SSL/TLS -> Overview)."
        echo "----------------------------------------------------------"
        ;;
    *)
        echo "Exiting without changes."
        exit 0
        ;;
esac
