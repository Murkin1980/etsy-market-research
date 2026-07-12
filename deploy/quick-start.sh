#!/bin/bash
set -euo pipefail

# Quick deploy script - builds and starts locally
echo "=== Building Docker image ==="
docker compose build

echo ""
echo "=== Starting service ==="
docker compose up -d

echo ""
echo "=== Health check ==="
sleep 5
curl -s http://localhost:3000/health | head -20

echo ""
echo "=== Service started ==="
echo "API: http://localhost:3000"
echo "Logs: docker compose logs -f"
echo "Stop: docker compose down"
