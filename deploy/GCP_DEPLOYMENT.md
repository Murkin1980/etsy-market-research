# Google Cloud production deployment

Deployment started on 2026-07-14. This document records resource names and operational commands without storing credentials, billing identifiers, or secret values.

## Resource inventory

| Resource | Value |
| --- | --- |
| Project | `etsy-research-prod-2026` |
| Region / zone | `me-central1` / `me-central1-c` |
| VM | `etsy-research-prod` |
| Machine | `e2-standard-2` (2 vCPU, 8 GB RAM) |
| Disk | 30 GB `pd-balanced` |
| Network / subnet | `etsy-vpc` / `etsy-subnet` (`10.20.0.0/24`) |
| Static address | `etsy-research-ip` |
| VM service account | `etsy-research-vm` |
| Runtime secret | `etsy-production-env` (version 1 disabled) |
| Snapshot policy | `etsy-daily-snapshots` (daily, 14 days) |
| Monthly budget | 75 USD; alerts at 50%, 80%, and 100% |
| Monitoring | Ops Agent plus `Etsy VM high CPU` alert policy |

## Security state

- Shielded VM: Secure Boot, vTPM, and integrity monitoring enabled.
- Deletion protection enabled.
- SSH ingress is limited to Google IAP `35.235.240.0/20`.
- Only TCP 80/443 are public; application port 3000 is bound to localhost.
- OS Login is enabled and the default Compute Engine service account has no Editor role.
- The dedicated VM service account can write logs/metrics and access only the production environment secret.
- The application container runs as non-root UID/GID 1001.

## Deployment

Bootstrap a fresh replacement VM at a tagged release:

```bash
git clone --branch v1.0.0 --depth 1 \
  https://github.com/Murkin1980/etsy-market-research.git ~/etsy-bootstrap
RELEASE_REF=v1.0.0 bash ~/etsy-bootstrap/deploy/gce-setup.sh
```

Load the environment from Secret Manager on the VM:

```bash
gcloud secrets versions access latest \
  --secret=etsy-production-env \
  --project=etsy-research-prod-2026 \
  | sudo tee /opt/etsy-research/.env >/dev/null
sudo chmod 600 /opt/etsy-research/.env
sudo systemctl restart etsy-research
```

## Operations

Local health check through IAP:

```powershell
gcloud compute ssh etsy-research-prod `
  --zone=me-central1-c `
  --tunnel-through-iap `
  --command="curl --fail --silent http://127.0.0.1:3000/health"
```

Service and container status:

```bash
sudo systemctl status etsy-research
sudo docker compose -f /opt/etsy-research/docker-compose.yml ps
sudo docker compose -f /opt/etsy-research/docker-compose.yml logs --tail=100
sudo systemctl status google-cloud-ops-agent
```

Retrieve the public address without recording it in source control:

```powershell
gcloud compute addresses describe etsy-research-ip `
  --region=me-central1 `
  --format="value(address)"
```

Create the high-CPU policy after creating an email notification channel:

```powershell
gcloud monitoring policies create `
  --project=etsy-research-prod-2026 `
  --policy-from-file=deploy/monitoring/high-cpu-policy.json `
  --notification-channels=NOTIFICATION_CHANNEL_RESOURCE_NAME
```

The checked-in policy intentionally excludes notification destinations and credentials.

## Remaining rollout

1. Point a domain A record at the reserved address.
2. Install/configure Caddy and verify automatic TLS on ports 80/443.
3. Configure a public HTTPS uptime check against `/health`.
