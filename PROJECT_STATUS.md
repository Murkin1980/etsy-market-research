# Etsy Market Research — Project Progress

Last updated: 2026-07-14

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

Status: **Completed**

- [x] Validate request bodies with a strict Zod schema and enforce size limits.
- [x] Require authentication for production deployment and fail closed without `API_KEY`.
- [x] Make proxy/IP handling explicit so forwarding headers are ignored by default.
- [x] Give every job a UUID and dedicated output/checkpoint paths.
- [x] Apply requested `pages`, `maxListings`, currency, country, language, and LLM options.
- [x] Add bounded queue capacity and completed-job retention.
- [x] Associate results directly with child-process output instead of scanning the newest matching directory.
- [x] Bind Docker to localhost by default and require an explicit public bind address.

## Stage 4 — Browser lifecycle and integration reliability

Status: **Completed**

- [x] Close Chromium cleanly after CLI jobs and failures.
- [x] Use isolated pages or contexts for concurrent listing work.
- [x] Add saved Etsy-like HTML fixtures and parser integration tests.
- [x] Add API job lifecycle tests without live Etsy access.
- [x] Verify retry, timeout, blocked-page, CAPTCHA, and partial-result behavior.
- [x] Deduplicate nested search-card matches and remove Etsy `click_key` tracking data.
- [x] Complete a local Chromium smoke test against the API health endpoint.

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
npm test           PASS (70/70)
npm run build      PASS
npm run lint       PASS
npm audit          PASS (0 known vulnerabilities)
browser smoke      PASS (local Chromium + /health, no console errors)
```

## Current known high-priority risks

1. Listing evidence and shop-level proxy signals are still mixed in sales scoring.
2. Important extracted fields do not yet record source and confidence.
3. Common currency pairs use static rates before the live provider is attempted.
4. Exported listing objects are not validated with Zod before being written.
5. CI and container smoke tests are not yet automated in GitHub Actions.
