#!/usr/bin/env bash
# ==============================================================================
# GitRabbit - Production AWS EC2 Ubuntu Provisioning & Hardening Script
# Target OS: Ubuntu 22.04 LTS / 24.04 LTS
# ==============================================================================

set -euo pipefail

SWAP_SIZE_GB="${SWAP_SIZE_GB:-4}"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-$USER}}"
SSH_PORT="${SSH_PORT:-22}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (or via sudo)."
   exit 1
fi

log_info "=========================================================="
log_info "🚀 Starting GitRabbit EC2 Production Host Setup..."
log_info "Deploy User: ${DEPLOY_USER}"
log_info "=========================================================="

# 1. Update system packages
log_info "1/7: Updating base packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# 2. Install essential system dependencies
log_info "2/7: Installing utilities, security tools, and monitoring packages..."
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git \
    jq \
    htop \
    ncdu \
    ufw \
    unzip \
    software-properties-common

# 3. Configure Swap Memory for OOM Protection
log_info "3/7: Configuring Swap Space (${SWAP_SIZE_GB}GB) to prevent OOM build crashes..."
SWAPFILE="/swapfile"
CURRENT_SWAP=$(free -m | awk '/^Swap:/ {print $2}')

if [[ "$CURRENT_SWAP" -lt 1024 ]]; then
    if [[ -f "$SWAPFILE" ]]; then
        swapoff "$SWAPFILE" || true
        rm -f "$SWAPFILE"
    fi
    log_info "Allocating ${SWAP_SIZE_GB}GB swap file at ${SWAPFILE}..."
    fallocate -l "${SWAP_SIZE_GB}G" "$SWAPFILE" || dd if=/dev/zero of="$SWAPFILE" bs=1M count=$((SWAP_SIZE_GB * 1024))
    chmod 600 "$SWAPFILE"
    mkswap "$SWAPFILE"
    swapon "$SWAPFILE"
    if ! grep -q "$SWAPFILE" /etc/fstab; then
        echo "$SWAPFILE none swap sw 0 0" >> /etc/fstab
    fi
    log_success "Swap of ${SWAP_SIZE_GB}GB enabled."
else
    log_info "Swap is already active (${CURRENT_SWAP}MB). Skipping allocation."
fi

# 4. Kernel Tuning (sysctl)
log_info "4/7: Applying production kernel sysctl optimizations..."
cat << 'EOF' > /etc/sysctl.d/99-microservices-production.conf
# Virtual Memory tuning
vm.swappiness=10
vm.vfs_cache_pressure=50
vm.max_map_count=262144

# Network connection handling & concurrency
net.core.somaxconn=2048
net.ipv4.tcp_max_syn_backlog=2048
net.ipv4.ip_local_port_range=10240 65535
net.ipv4.tcp_tw_reuse=1
net.ipv4.tcp_fin_timeout=15

# File descriptor capacity
fs.file-max=2097152
EOF

sysctl --system > /dev/null
log_success "Kernel parameters applied."

# 5. Install Docker CE & Docker Compose V2
log_info "5/7: Installing / Verifying Docker Engine & Docker Compose Plugin..."
if ! command -v docker &> /dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker
    log_success "Docker CE installed successfully."
else
    log_info "Docker is already installed: $(docker --version)"
fi

# Docker Daemon Hardening (Log Rotation + Live Restore)
log_info "Configuring Docker daemon log limits & live-restore..."
mkdir -p /etc/docker
cat << 'EOF' > /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5"
  },
  "live-restore": true,
  "userland-proxy": false
}
EOF
systemctl reload docker || systemctl restart docker
log_success "Docker daemon configured with log rotation."

# Add Deploy User to Docker Group
log_info "Adding user '${DEPLOY_USER}' to docker group..."
usermod -aG docker "${DEPLOY_USER}" || true

# 6. Configure UFW Firewall
log_info "6/7: Configuring Firewall rules (Ports: ${SSH_PORT}, 80, 443)..."
ufw default deny incoming
ufw default allow outgoing
ufw allow "${SSH_PORT}/tcp" comment 'SSH Access'
ufw allow 80/tcp comment 'HTTP Nginx Gateway'
ufw allow 443/tcp comment 'HTTPS Nginx Gateway'
ufw --force enable
log_success "UFW firewall configured and enabled."

# 7. Create Target Project Directory & Backups Folder
log_info "7/7: Setting up application and snapshot directories..."
mkdir -p /opt/gitrabbit /var/backups/deploy-snapshots
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" /opt/gitrabbit /var/backups/deploy-snapshots

log_success "=========================================================="
log_success "🎉 EC2 Production Host Setup Completed Successfully!"
log_success "Docker version:         $(docker --version)"
log_success "Docker Compose version: $(docker compose version)"
log_success "Active Swap:            $(free -h | awk '/^Swap:/ {print $2}')"
log_success "Deploy directory:       /opt/gitrabbit"
log_success "=========================================================="
