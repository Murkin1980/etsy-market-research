# Etsy Market Research

Production-ready Node.js/TypeScript pipeline for researching digital-product niches on Etsy. It collects search and listing evidence, normalizes currencies and listing data, calculates transparent opportunity signals, exports reproducible reports, and can optionally add analysis through OpenAI or Anthropic.

> Use the tool responsibly. Automated access can be restricted by Etsy; comply with Etsy's Terms of Use and `robots.txt`. The scraper uses low concurrency, randomized delays, retries, caching, and block detection, but those controls do not grant permission to scrape.

## Requirements

- Node.js 20+
- npm
- Chromium installed through Playwright

## Install

```bash
npm ci
npm run playwright:install
cp .env.example .env
```

PowerShell equivalent:

```powershell
npm.cmd ci
npm.cmd run playwright:install
Copy-Item .env.example .env
```

The CLI works without an LLM key. Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` only when using `--use-llm`. Production API mode also requires a random `API_KEY` of at least 24 characters; 32+ is recommended.

## Run research

```bash
npm run build
npm run research -- --query "digital planner" --pages 2 --max-listings 80

# Optional AI analysis
npm run research -- --query "Notion template" --use-llm --llm-provider openai

# Continue an interrupted query from its checkpoint
npm run research -- --query "digital planner" --resume
```

Important CLI options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--query` | required | Etsy search phrase |
| `--pages` | `2` | Search-result pages (1–10 through the API) |
| `--max-listings` | `80` | Listings to process |
| `--currency` | `USD` | Reporting currency |
| `--country` | `US` | Browser region |
| `--language` | `en-US` | Browser locale |
| `--concurrency` | `2` | Parallel browser work |
| `--delay-min` / `--delay-max` | `2500` / `6000` | Random delay range in milliseconds |
| `--use-llm` | `false` | Add OpenAI/Anthropic analysis |
| `--resume` | `false` | Resume from checkpoint |

Each run is isolated under:

```text
data/runs/<timestamp>_<query>/
├── run-result.json
├── raw/
└── reports/
    ├── listings-full.json
    ├── listings-summary.csv
    ├── market-analysis.json       # only with --use-llm
    ├── failed-listings.json
    └── run-metadata.json
```

The schema version is recorded in `run-result.json`, metadata, JSON, and CSV exports. Evidence fields distinguish observed values from estimates. Opportunity scoring does not present shop-wide sales as listing-specific sales.

## HTTP API

```bash
npm run build
npm start
curl http://127.0.0.1:3000/health
```

Authenticated request:

```bash
curl -X POST http://127.0.0.1:3000/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"query":"Notion template","pages":2,"maxListings":50,"useLlm":false}'
```

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /health` | public | Health and queue capacity |
| `GET /jobs` | bearer | Retained jobs |
| `POST /jobs` | bearer | Validate and queue research |
| `GET /jobs/:id` | bearer | Job state and structured result |
| `GET /runs` | bearer | Stored run summaries |

The API validates body size and fields, limits requests by client IP, caps the job queue, bounds child-process output, and shuts down active workers on `SIGTERM`/`SIGINT`. Configure `TRUST_PROXY=true` only behind a trusted proxy that replaces `X-Forwarded-For`.

## Quality gates

```bash
npm run check       # typecheck + lint + 81 tests + build
npm run smoke:api   # health, auth, and validation smoke test
npm audit --audit-level=high
```

GitHub Actions runs these checks on Linux and Windows, then builds the production image and verifies its health endpoint.

## Docker

```bash
cp .env.example .env
# Set API_KEY before production startup and keep BIND_ADDRESS=127.0.0.1.
docker compose up -d --build
docker compose ps
docker compose logs -f
```

The container runs as a non-root user with dropped capabilities, a read-only root filesystem, a process limit, and persistent `data/` and `logs/` mounts. Port 3000 is published on localhost by default. Put TLS and authentication-aware routing in front of it; do not expose port 3000 directly to the internet.

## Google Compute Engine

The reviewed production baseline is documented in [`deploy/GCE_SERVER_SPEC.md`](deploy/GCE_SERVER_SPEC.md): `e2-standard-2` (2 vCPU, 8 GB RAM), Ubuntu 24.04 LTS, 30 GB balanced persistent disk, standard provisioning, IAP/OS Login administration, and HTTPS-only public ingress. Provisioning is the next infrastructure stage.

On a prepared VM:

```bash
bash deploy/gce-setup.sh
sudoedit /opt/etsy-research/.env
sudo systemctl start etsy-research
curl http://127.0.0.1:3000/health
```

## Configuration highlights

| Variable | Production baseline |
| --- | --- |
| `SCRAPER_CONCURRENCY` | `2` |
| `SCRAPER_DELAY_MIN_MS` / `MAX` | `2500` / `6000` |
| `API_KEY` | Random 32+ character secret |
| `REQUIRE_API_KEY` | `true` |
| `MAX_CONCURRENT_JOBS` | `2` |
| `MAX_QUEUED_JOBS` | `50` |
| `SERVER_HOST` | `0.0.0.0` inside Docker |
| `BIND_ADDRESS` | `127.0.0.1` on the VM |

See [`.env.example`](.env.example) for all settings. The implementation plan and completed quality evidence are in [`PROJECT_STATUS.md`](PROJECT_STATUS.md).
