# Etsy Market Research — Project Progress

Last updated: 2026-07-15

## Goal

Build a reliable Etsy market-research pipeline that collects search and listing data, normalizes it, calculates explainable demand signals, exports reproducible reports, and optionally adds LLM-assisted competitive analysis.

## Stage 1 — Repository audit and baseline

Status: **Completed**

- [x] Repository, build, tests, lint, and dependencies audited.
- [x] Critical correctness, security, reliability, and documentation gaps documented.

## Stage 2 — Critical correctness fixes

Status: **Completed**

- [x] Fixed duplicate API responses and implemented bounded parallel listing work.
- [x] Repaired checkpoint/resume merging and query isolation.
- [x] Corrected currency, thousands separators, and fallback review signals.
- [x] Added regression tests for each corrected defect.

## Stage 3 — HTTP API security and job isolation

Status: **Completed**

- [x] Added strict request schemas, body limits, bearer authentication, and fail-closed production startup.
- [x] Made trusted-proxy behavior explicit and rate limited by validated client IP.
- [x] Added UUID job isolation, bounded queues, retained-job limits, and structured child-process results.
- [x] Bound Docker publication to localhost by default.

## Stage 4 — Browser lifecycle and integration reliability

Status: **Completed**

- [x] Closed Chromium on success/failure and isolated concurrent browser work.
- [x] Added Etsy-like HTML fixtures, integration tests, and API lifecycle tests.
- [x] Verified timeout, retry, block/CAPTCHA, and partial-result behavior.
- [x] Removed duplicate nested cards and Etsy tracking parameters.

## Stage 5 — Data quality and market analysis

Status: **Completed**

- [x] Separated listing evidence from shop-level proxy signals.
- [x] Recorded extraction source/confidence and improved locale-aware parsing.
- [x] Added dated exchange-rate provider/cache/fallback provenance.
- [x] Versioned and validated JSON/CSV exports and upgraded legacy checkpoint data.
- [x] Added deterministic scoring, summary, rate, export, and LLM payload tests.

## Stage 6 — Documentation, deployment, and release

Status: **Completed**

- [x] Synced README paths, behavior, API fields, and verification commands with the implementation.
- [x] Made npm commands cross-platform and added a production API smoke command.
- [x] Hardened the non-root Docker image/Compose runtime and documented the GCE production profile.
- [x] Added Linux/Windows CI and a production-container health smoke check.
- [x] Ran one controlled live Etsy request. Etsy returned HTTP 403/block detection; the test stopped without retries or bypass attempts.
- [x] Prepared release `v1.0.0` with reproducible quality gates.

## Release verification

```text
npm run check      PASS (typecheck + lint + 81/81 tests + build)
npm run smoke:api  PASS (health + authentication + request validation)
npm audit          PASS (0 known vulnerabilities)
live Etsy smoke    COMPLETE (HTTP 403 detected; stopped without bypass)
container smoke    AUTOMATED IN CI (Docker unavailable on this workstation)
```

## Next phase — Google Cloud infrastructure

All six product stages are complete. Infrastructure work begins from `deploy/GCE_SERVER_SPEC.md`:

1. Provision the reviewed Google Compute Engine VM.
2. Configure IAP/OS Login, HTTPS ingress, secrets, backups, and monitoring.
3. Deploy `v1.0.0`, run remote health checks, and establish a low-volume scheduled workload.

Operational caveat: the current network is blocked by Etsy (HTTP 403). Production access must remain policy-compliant; do not attempt to bypass Etsy controls. Validate access from the deployment environment before enabling scheduled research.

## Stage 7 — Google Cloud production rollout

Status: **Completed**

- [x] Create a dedicated project and attach billing.
- [x] Add a 75 USD monthly budget with 50%, 80%, and 100% alerts.
- [x] Create a custom VPC/subnet and restrict SSH to IAP.
- [x] Create the least-privilege VM service account and remove the default Editor grant.
- [x] Provision `e2-standard-2`, Ubuntu 24.04, 30 GB balanced disk, static address, Shielded VM, and deletion protection.
- [x] Store the generated production environment in Secret Manager.
- [x] Deploy release `v1.0.0` with Docker/systemd and pass the internal API health check.
- [x] Attach daily snapshots with 14-day retention and install Google Cloud Ops Agent.
- [x] Configure `34-18-107-101.sslip.io`, Caddy automatic TLS, security headers, and HTTP-to-HTTPS redirect.
- [x] Complete controlled remote smoke tests; Etsy blocked both low-volume requests and the scraper stopped without bypass attempts.
- [x] Deploy the blocked-search result fix and verify production reports `blockedCount=1` with a failed run status.
- [x] Add a production email notification channel and a high-CPU alert policy.
- [x] Add a public HTTPS `/health` uptime check from three regions with email failure notification.

## Stage 8 — Signal Lab web panel

Status: **Completed**

- [x] Add a responsive operational dashboard, research form, job polling, run history, and result details.
- [x] Keep API credentials tab-scoped and add explicit connect, disconnect, unauthorized, and read-only states.
- [x] Add allowlisted authenticated JSON/CSV report downloads with traversal protection.
- [x] Self-host Lucide `1.24.0`, Onest Cyrillic, and Instrument Serif assets under a strict CSP.
- [x] Verify desktop and 390 px mobile layouts, keyboard-accessible semantics, empty/error states, and zero clean-load console errors.
- [x] Pass typecheck, lint, 84/84 tests, build, and local production-server browser checks.
- [x] Deploy release `v1.1.0` to Google Cloud and verify the complete public workflow.

Production verification:

```text
public panel       PASS (HTTPS 200, strict CSP, self-hosted assets)
health             PASS (v1.1.0, container healthy)
authorization      PASS (Secret Manager key, no key disclosure)
stored runs        PASS (3 production runs visible)
report downloads   PASS (5 allowlisted files visible for a stored run)
browser console    PASS (0 errors, 0 warnings on clean load)
```

## Stage 9 — Official Etsy Open API v3

Status: **Completed; Etsy application activation pending**

- [x] Replace production browser collection with `findAllListingsActive` from the official Etsy Open API v3.
- [x] Enrich search results in batches of up to 100 through `getListingsByListingIds` with Images, Shop, Videos, and BuyerPrice.
- [x] Add bounded retries, `Retry-After` handling, timeouts, clear 401/403/429 errors, and secret-safe logging.
- [x] Map API data into the existing versioned reports while keeping shop proxies separate from listing evidence.
- [x] Expose non-secret Etsy API readiness in `/health` and disable launches in Signal Lab until the server credential is configured.
- [x] Add Etsy credential settings to Signal Lab with official ping verification and encrypted persistent storage.
- [x] Preserve structured CLI failures so the web panel shows Etsy's actionable error instead of an empty exit-code message.
- [x] Pass typecheck, lint, 93/93 tests, build, API smoke, desktop/mobile browser checks, and a clean-load console check.
- [ ] Wait for Etsy to activate the submitted application, then save the active key through Signal Lab and run the first production API research.

Official API flow:

```text
Signal Lab → protected job → Etsy active-listing search → batch enrichment
           → evidence mapping → scoring/analysis → JSON + CSV reports
```
