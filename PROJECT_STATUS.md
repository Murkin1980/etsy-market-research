# Etsy Market Research — Project Progress

Last updated: 2026-07-13

## Goal

Build a reliable Etsy market-research pipeline that collects search and listing data, normalizes it, calculates explainable demand signals, exports reproducible reports, and optionally adds LLM-assisted competitive analysis.

## Stage 1 — Repository audit and baseline

Status: **Completed**

- [x] Repository cloned and working tree verified.
- [x] TypeScript typecheck passes.
- [x] Production build passes.
- [x] 45 unit tests pass.
- [x] Direct ESLint run passes.
- [x] npm dependency audit reports zero known vulnerabilities.
- [x] Critical correctness, security, reliability, and documentation gaps documented.

## Stage 2 — Critical correctness fixes

Status: **Completed**

- [x] Prevent duplicate HTTP responses when jobs are queued.
- [x] Make `--concurrency` perform actual parallel work safely.
- [x] Repair checkpoint/resume result merging and query isolation.
- [x] Keep USD values semantically correct regardless of Etsy display currency.
- [x] Correct thousands-separator parsing in listing prices.
- [x] Reuse search-result rating and review data when listing-level values are unavailable.
- [x] Add regression tests for corrected data, checkpoint, and concurrency defects.

Exit criteria:

- Critical regression tests pass.
- No processed listing disappears after resume.
- Currency and review signals remain internally consistent.
- API queueing returns exactly one response per request.

## Stage 3 — HTTP API security and job isolation

Status: **Pending**

- [ ] Validate request bodies with a schema and enforce size limits.
- [ ] Require authentication for non-local production deployment.
- [ ] Make proxy/IP handling explicit so rate limits cannot be trivially bypassed.
- [ ] Give every job a collision-resistant ID and dedicated output/checkpoint paths.
- [ ] Apply requested `pages`, `maxListings`, currency, country, and LLM options.
- [ ] Add retention/cleanup instead of permanently exhausting `MAX_JOBS_TOTAL`.

## Stage 4 — Browser lifecycle and integration reliability

Status: **Pending**

- [x] Close Chromium cleanly after CLI jobs and failures.
- [ ] Use isolated pages or contexts for concurrent listing work.
- [ ] Add saved Etsy HTML fixtures and parser integration tests.
- [ ] Add API job lifecycle tests without live Etsy access.
- [ ] Verify retry, timeout, blocked-page, CAPTCHA, and partial-result behavior.

## Stage 5 — Data quality and market analysis

Status: **Pending**

- [ ] Separate listing evidence from shop-level proxy signals in scoring.
- [ ] Record extraction source and confidence for important fields.
- [ ] Improve locale-aware number, price, rating, and review parsing.
- [ ] Replace static-first exchange rates with a dated provider/cache policy.
- [ ] Validate exported listings with Zod before writing reports.
- [ ] Add deterministic tests for scoring, summaries, and LLM payload construction.

## Stage 6 — Documentation, deployment, and release

Status: **Pending**

- [ ] Make README output paths and supported API parameters match the code.
- [ ] Make npm scripts cross-platform.
- [ ] Harden Docker and GCE defaults.
- [ ] Add CI for typecheck, lint, tests, build, and container smoke checks.
- [ ] Run a controlled live smoke test against Etsy within documented limits.
- [ ] Publish a tagged release with reproducible verification commands.

## Current verification

```text
npm run typecheck  PASS
npm test           PASS (52/52)
npm run build      PASS
npm run lint       PASS
npm audit          PASS (0 known vulnerabilities)
```

## Current known high-priority risks

1. Public deployment defaults allow unauthenticated job creation.
2. Concurrent server jobs can still collide on run and checkpoint paths.
3. API request bodies are not schema-validated or size-limited.
4. Common currency pairs use static rates before the live provider is attempted.
5. Completed HTTP jobs are retained forever and eventually exhaust `MAX_JOBS_TOTAL`.
