# Etsy Market Research — Project Progress

Last updated: 2026-07-14

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
npm run check      PASS (typecheck + lint + 80/80 tests + build)
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
