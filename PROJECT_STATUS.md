# Project Status

## Completed

- [x] Project initialization (TypeScript, ESLint, Prettier, Vitest)
- [x] CLI configuration (yargs with all options)
- [x] Type definitions (listing.ts, schemas.ts with Zod)
- [x] Configuration system (env.ts, defaults.ts, .env)
- [x] Logger (pino with file output)
- [x] Retry with exponential backoff
- [x] Delay utilities
- [x] Concurrency limiter with adaptive reduction
- [x] Text cleaning (HTML, entities, unicode, marketing noise)
- [x] Currency parsing (USD, EUR, GBP, 20+ currencies)
- [x] EU/US number format heuristic
- [x] URL normalization (tracking params, canonical form)
- [x] Listing ID extraction
- [x] Deduplication by listing ID
- [x] Search URL builder
- [x] Browser manager (Playwright, stealth config)
- [x] Search page parser (DOM + embedded JSON fallback)
- [x] Listing page scraper (JSON-LD + DOM + text parsing)
- [x] Centralized selectors
- [x] Sales score calculation (configurable formula)
- [x] Feature extraction from descriptions
- [x] Market feature analysis
- [x] Claude API integration (Zod-validated JSON response)
- [x] File cache with TTL
- [x] Checkpoint system (save/resume)
- [x] JSON exporter (listings, analysis, failures, metadata)
- [x] CSV exporter (summary spreadsheet)
- [x] Main orchestration (cli.ts)
- [x] 45 unit tests (text-cleaner, currency, url, sales-estimator, listing-parser)
- [x] README.md
- [x] TypeScript check — clean
- [x] ESLint — clean

## In Progress

- [ ] Live testing against Etsy (requires running the scraper)

## Pending

- [ ] HTML fixture files for offline testing
- [ ] Integration tests with saved HTML
- [ ] Etsy API integration (alternative to scraping)
- [ ] More sophisticated keyword extraction

## Known Issues

- Etsy selectors may change without notice
- Listing-specific review counts may be unavailable on some pages
- The tool uses approximate exchange rates as fallback

## Last Verified Commands

```bash
npx tsc --noEmit          # ✓ Clean
npx eslint "src/**/*.ts"  # ✓ Clean
npx vitest run            # ✓ 45/45 tests passing
```
