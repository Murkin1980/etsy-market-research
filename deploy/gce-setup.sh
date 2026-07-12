#!/bin/bash
set -euo pipefail

# Google Cloud Engine setup script for Etsy Market Research tool
# Run this on a fresh Ubuntu 22.04/24.04 LTS VM

echo "=== Etsy Research Tool - GCE Setup ==="

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER
  echo "Docker installed. You may need to log out and back in for group changes."
fi

# Install Docker Compose
if ! command -v docker compose &> /dev/null; then
  echo "Installing Docker Compose..."
  sudo apt-get install -y docker-compose-plugin
fi

# Install git
if ! command -v git &> /dev/null; then
  sudo apt-get install -y git
fi

# Create app directory
APP_DIR="/opt/etsy-research"
sudo mkdir -p "$APP_DIR"
sudo chown $USER:$USER "$APP_DIR"

# Clone repo (or pull latest if already exists)
if [ -d "$APP_DIR/.git" ]; then
  echo "Pulling latest changes..."
  cd "$APP_DIR" && git pull
else
  echo "Cloning repository..."
  git clone https://github.com/Murkin1980/etsy-market-research.git "$APP_DIR"
  cd "$APP_DIR"
fi

# Create .env from template if not exists
if [ ! -f "$APP_DIR/.env" ]; then
  cp .env.example .env
  echo ""
  echo "!!! Edit $APP_DIR/.env with your settings !!!"
  echo "Required: ANTHROPIC_API_KEY (if using --use-llm)"
  echo ""
fi

# Create systemd service
sudo tee /etc/systemd/system/etsy-research.service > /dev/null <<EOF
[Unit]
Description=Etsy Market Research API
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStartPre=/usr/bin/docker compose pull
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose restart
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable etsy-research

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Edit .env:  nano $APP_DIR/.env"
echo "  2. Start:      sudo systemctl start etsy-research"
echo "  3. Check:      sudo systemctl status etsy-research"
echo "  4. Logs:       docker compose -f $APP_DIR/docker-compose.yml logs -f"
echo "  5. API:        curl http://localhost:3000/health"
echo ""
echo "Firewall (allow port 3000):"
echo "  gcloud compute firewall-rules create allow-etsy-api --allow tcp:3000"
echo ""
