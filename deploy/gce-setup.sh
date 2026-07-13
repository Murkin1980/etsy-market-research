#!/usr/bin/env bash
set -euo pipefail

# Bootstrap a fresh Ubuntu 24.04 LTS VM after network, OS Login, and IAP are configured.
APP_DIR="/opt/etsy-research"
REPOSITORY="https://github.com/Murkin1980/etsy-market-research.git"
RELEASE_REF="${RELEASE_REF:-master}"
CONTAINER_UID="${CONTAINER_UID:-1001}"
CONTAINER_GID="${CONTAINER_GID:-1001}"

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo apt-get install -y ca-certificates git docker.io
if ! sudo apt-get install -y docker-compose-v2; then
  sudo apt-get install -y docker-compose-plugin
fi
sudo systemctl enable --now docker

sudo mkdir -p "$APP_DIR"
sudo chown "$(id -u):$(id -g)" "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --tags --prune
else
  git clone "$REPOSITORY" "$APP_DIR"
fi
if git -C "$APP_DIR" show-ref --verify --quiet "refs/remotes/origin/$RELEASE_REF"; then
  git -C "$APP_DIR" checkout --detach "origin/$RELEASE_REF"
else
  git -C "$APP_DIR" checkout --detach "$RELEASE_REF"
fi

if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
fi
chmod 600 "$APP_DIR/.env"

# The pinned Playwright image runs as pwuser (UID/GID 1001). Bind mounts must
# be writable by that non-root user on a fresh VM.
mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
sudo chown -R "$CONTAINER_UID:$CONTAINER_GID" "$APP_DIR/data" "$APP_DIR/logs"

sudo tee /etc/systemd/system/etsy-research.service >/dev/null <<EOF
[Unit]
Description=Etsy Market Research API
After=docker.service network-online.target
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$APP_DIR
ExecStartPre=/usr/bin/docker compose config --quiet
ExecStart=/usr/bin/docker compose up -d --build --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=600
TimeoutStopSec=60

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable etsy-research

echo "Bootstrap complete. Before starting:"
echo "  1. Set a 32+ character API_KEY in $APP_DIR/.env"
echo "  2. Keep BIND_ADDRESS=127.0.0.1"
echo "  3. Configure HTTPS reverse proxy/load balancer"
echo "  4. Start: sudo systemctl start etsy-research"
echo "  5. Verify: curl http://127.0.0.1:3000/health"
