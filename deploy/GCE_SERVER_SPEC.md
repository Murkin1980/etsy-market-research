# Google Compute Engine production profile

This is the recommended baseline for the first production deployment. Provisioning is intentionally deferred to the infrastructure stage.

## Compute

- Machine family/type: E2, `e2-standard-2`
- CPU/RAM: 2 vCPU, 8 GB RAM
- Provisioning: standard VM, not Spot
- Region/zone starting point: `me-central1-c` (Doha); benchmark latency and price before committing
- Operating system: Ubuntu 24.04 LTS x86_64
- Boot disk: 30 GB `pd-balanced`, encrypted with Google-managed keys
- Backups: daily incremental snapshot, 14-day retention

Upgrade to `e2-standard-4` (4 vCPU, 16 GB RAM) when running more than two browser jobs concurrently or when monitoring shows sustained memory pressure.

## Network and access

- Keep application port 3000 bound to localhost/internal networking.
- Expose only HTTPS (443) through a reverse proxy or load balancer; redirect HTTP (80) to HTTPS.
- Use IAP TCP forwarding and OS Login for administrator SSH access. Do not expose TCP 22 to the public internet.
- A static external IP is only needed for a public API endpoint without an external load balancer.
- Permit outbound HTTPS for Etsy, exchange-rate providers, package registries, and the configured LLM provider.

## Runtime

- Docker Engine with the Compose plugin
- One API container, `SCRAPER_CONCURRENCY=2`, `MAX_CONCURRENT_JOBS=2`
- Persistent `data/` and `logs/` directories
- Optional 2 GB swap as an emergency buffer; it is not a substitute for RAM
- Secrets in Google Secret Manager or a root-readable `.env` file (`chmod 600`) during bootstrap
- Cloud Logging/Monitoring alerts for VM availability, disk usage, memory, API health, and job failures

## Security baseline

- Shielded VM with vTPM and integrity monitoring; enable Secure Boot after validating the image
- Dedicated least-privilege service account and no broad default OAuth scopes
- Automatic security updates, API bearer key of at least 32 random characters, TLS, and rate limiting
- No Spot VM for the primary instance because it can be preempted without notice

## Official references

- [E2 machine types](https://docs.cloud.google.com/compute/docs/general-purpose-machines)
- [Regions and zones](https://docs.cloud.google.com/compute/docs/regions-zones)
- [Persistent Disk performance](https://cloud.google.com/compute/docs/disks/performance)
- [Ubuntu images](https://docs.cloud.google.com/compute/docs/images/os-details)
- [Shielded VM](https://docs.cloud.google.com/compute/docs/about-shielded-vm)
- [SSH and IAP best practices](https://docs.cloud.google.com/compute/docs/connect/ssh-best-practices/network-access)
- [Spot VM limitations](https://docs.cloud.google.com/compute/docs/instances/create-use-spot)
