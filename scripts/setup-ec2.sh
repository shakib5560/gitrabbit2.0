#!/usr/bin/env bash
# ==============================================================================
# GitRabbit Backend - AWS EC2 Server Initialization Script
# Supported OS: Ubuntu 22.04 LTS / 24.04 LTS / Debian 12
# Run this once on a fresh EC2 instance:
#   chmod +x setup-ec2.sh && ./setup-ec2.sh
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "🐰 Starting GitRabbit AWS EC2 Server Setup"
echo "=========================================================="

# 1. Update OS packages
echo "📦 Updating OS package lists..."
sudo apt-get update -y
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw htop

# 2. Install Docker Engine & Docker Compose Plugin
if ! command -v docker &> /dev/null; then
    echo "🐳 Installing Docker Engine from official repository..."
    sudo mkdir -m 0755 -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Enable Docker to start on boot
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✔ Docker Engine installed successfully."
else
    echo "✔ Docker is already installed: $(docker --version)"
fi

# 3. Add current user to Docker group (allows running docker without sudo)
echo "👤 Adding $USER to docker group..."
sudo usermod -aG docker "$USER" || true

# 4. Configure Firewall (UFW)
echo "🛡️ Configuring Firewall rules (Ports: 22, 80, 443)..."
sudo ufw allow 22/tcp comment 'SSH' || true
sudo ufw allow 80/tcp comment 'HTTP API Gateway' || true
sudo ufw allow 443/tcp comment 'HTTPS' || true
sudo ufw --force enable || true

# 5. Clone Git Repository if not present
TARGET_DIR="$HOME/gitrabbit2.0"
if [ ! -d "$TARGET_DIR" ]; then
    echo "📂 Cloning repository into $TARGET_DIR..."
    git clone https://github.com/shakib5560/gitrabbit2.0.git "$TARGET_DIR"
else
    echo "✔ Repository folder $TARGET_DIR already exists."
fi

# 6. Verify Docker Compose
echo "🔍 Checking installed versions:"
docker --version
docker compose version

echo "=========================================================="
echo "🎉 EC2 Setup Complete!"
echo "Next Steps:"
echo "1. Log out and log back in (or run 'newgrp docker') to apply docker group permissions."
echo "2. Create your production .env file in $TARGET_DIR/.env"
echo "3. Run '$TARGET_DIR/scripts/deploy.sh' to launch your microservices stack."
echo "=========================================================="
