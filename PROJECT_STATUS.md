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

Status: **Pending**

- [x] Close Chromium cleanly after CLI jobs and failures.
- [x] Use isolated pages or contexts for concurrent listing work.
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
npm test           PASS (59/59)
npm run build      PASS
npm run lint       PASS
npm audit          PASS (0 known vulnerabilities)
```

## Current known high-priority risks

1. Saved Etsy HTML fixtures and parser integration tests are still missing.
2. Retry, timeout, CAPTCHA, and blocked-page flows need integration coverage.
3. Common currency pairs use static rates before the live provider is attempted.
4. Exported listing objects are not validated with Zod before being written.
5. CI and container smoke tests are not yet automated in GitHub Actions.
