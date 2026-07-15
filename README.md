# Etsy Market Research

Production-ready Node.js/TypeScript pipeline for researching digital-product niches through the official Etsy Open API v3. It collects search and listing evidence, normalizes currencies and listing data, calculates transparent opportunity signals, exports reproducible reports, and can optionally add analysis through OpenAI or Anthropic.

> Use the tool responsibly and comply with Etsy's API Terms of Use. The default production data source is the official API. The legacy browser collector remains available only as an explicit compatibility mode and must not be used to sidestep API access controls.

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

The CLI works without an LLM key. Set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` when using `--use-llm` or the post-run AI analyst in Signal Lab. The default OpenAI model is `gpt-5.6-luna` and can be changed through `OPENAI_MODEL`. Market research requires `ETSY_API_KEY` in `keystring:shared_secret` format. The production web server uses invited user accounts; a random `API_KEY` of 32+ characters remains the emergency administrator credential and bootstrap path for the first invitation.

## Etsy Open API setup

1. Register an application at <https://www.etsy.com/developers/your-apps>.
2. Copy its keystring and shared secret.
3. Set `ETSY_API_KEY=<keystring>:<shared_secret>` in `.env` or Secret Manager.
4. Keep `ETSY_DATA_SOURCE=api` and restart the service.

Public active-listing search uses application authentication and does not require a member OAuth token. Etsy may require an approved access level for marketplace-wide use. The client searches `/v3/application/listings/active`, enriches up to 100 listing IDs per batch through `/v3/application/listings/batch`, honors API rate limits, and never writes the Etsy credential to reports or logs.

The term "Etsy" is a trademark of Etsy, Inc. This application uses the Etsy API but is not endorsed or certified by Etsy, Inc.

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
| `--pages` | `2` | API result batches (1–10, up to 100 listings each) |
| `--max-listings` | `80` | Listings to process |
| `--currency` | `USD` | Reporting currency |
| `--country` | `US` | Buyer country for Etsy price calculation |
| `--language` | `en-US` | Compatibility-mode browser locale |
| `--concurrency` | `2` | Compatibility-mode parallel browser work |
| `--delay-min` / `--delay-max` | `2500` / `6000` | Compatibility-mode delay range |
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

The production server includes the **Signal Lab** web panel at `/`. It provides:

- invite-only accounts with scrypt password hashing, persistent HttpOnly/SameSite sessions, CSRF protection, and admin/member roles;
- personal workspaces that isolate retained jobs, runs, AI analyses, and report downloads by server-enforced ownership;
- emergency administrator API-key access stored only in the current browser tab;
- Etsy Open API credential setup with live verification and encrypted persistent storage;
- validated research-job creation with conservative defaults;
- live queue/job status and clear blocked/failed states;
- retained job and stored-run browsing;
- on-demand AI analysis of an existing report with deterministic metrics, data-quality warnings, competitor evidence, verified Etsy shop/listing links, product positioning, pricing, packaging, and validation risks;
- authenticated downloads for allowlisted JSON/CSV report files;
- responsive desktop/mobile layouts with self-hosted Onest, Instrument Serif, and Lucide assets.

Production panel: <https://34-18-107-101.sslip.io/>

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
| `GET /` | public | Signal Lab web panel |
| `GET /health` | public | Health and queue capacity |
| `POST /auth/login` | public | Start a protected account session |
| `POST /auth/register` | invite | Create an account from a one-time invitation |
| `GET /auth/me` | cookie/key | Restore the current session and rotate its CSRF token |
| `POST /auth/logout` | session | Revoke the current session |
| `POST /admin/invites` | admin | Create a one-time member/admin invitation |
| `GET /jobs` | bearer | Retained jobs |
| `POST /jobs` | bearer | Validate and queue research |
| `GET /jobs/:id` | bearer | Job state and structured result |
| `GET /settings/etsy-api` | bearer | Non-secret Etsy API readiness |
| `PUT /settings/etsy-api` | bearer | Verify and encrypt Etsy application credentials |
| `GET /runs` | bearer | Stored run summaries |
| `GET /runs/:id/files` | bearer | Allowlisted report-file metadata |
| `GET /runs/:id/files/:name` | bearer | Download an allowlisted JSON/CSV report |
| `GET /runs/:id/ai-analysis` | bearer | Read a saved AI market analysis or its readiness state |
| `POST /runs/:id/ai-analysis` | bearer | Generate or refresh an AI analysis from a completed report |

The API validates body size and fields, limits requests by client IP, caps the job queue, bounds child-process output, and shuts down active workers on `SIGTERM`/`SIGINT`. Account and ownership records are atomically persisted under the existing `data/` volume with mode `0600`; passwords use salted scrypt hashes and raw session/invitation tokens are never stored. Existing unowned production reports are visible only to administrators. Etsy credentials saved through Signal Lab are verified before persistence, encrypted with AES-256-GCM using a key derived from the production `API_KEY`, and never returned to the browser. Rotating `API_KEY` requires entering the Etsy credential again. Configure `TRUST_PROXY=true` only behind a trusted proxy that replaces `X-Forwarded-For`.

## Quality gates

```bash
npm run check       # typecheck + lint + 102 tests + build
npm run smoke:api   # health, auth, and validation smoke test
npm run smoke:ai    # one safe live structured-output request (uses API credits)
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
| `ETSY_API_KEY` | Etsy `keystring:shared_secret` stored in Secret Manager |
| `ETSY_DATA_SOURCE` | `api` |
| `ETSY_API_TIMEOUT_MS` | `30000` |
| `OPENAI_API_KEY` | Dedicated OpenAI project key stored only in Secret Manager / `.env.local` |
| `OPENAI_MODEL` | `gpt-5.6-luna` |
| `LLM_TIMEOUT_MS` | `120000` |
| `SCRAPER_CONCURRENCY` | `2` |
| `SCRAPER_DELAY_MIN_MS` / `MAX` | `2500` / `6000` |
| `API_KEY` | Random 32+ character secret |
| `REQUIRE_API_KEY` | `true` |
| `SESSION_TTL_DAYS` | `7` |
| `MAX_CONCURRENT_JOBS` | `2` |
| `MAX_QUEUED_JOBS` | `50` |
| `SERVER_HOST` | `0.0.0.0` inside Docker |
| `BIND_ADDRESS` | `127.0.0.1` on the VM |

See [`.env.example`](.env.example) for all settings. The implementation plan and completed quality evidence are in [`PROJECT_STATUS.md`](PROJECT_STATUS.md).
