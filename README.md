# Etsy Market Research Tool

Automated market research tool for digital products on Etsy. Collects search results, scrapes listing details, normalizes data, calculates sales estimates, and optionally performs competitive analysis via Claude API.

## Requirements

- Node.js 20+
- npm
- Playwright browser (Chromium)

## Installation

```bash
cd etsy-market-research
npm install
npx playwright install chromium
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Required for LLM analysis |
| `HEADLESS` | `true` | Run browser without UI |
| `SCRAPER_CONCURRENCY` | `2` | Parallel pages |
| `SCRAPER_DELAY_MIN_MS` | `2500` | Min delay between requests |
| `SCRAPER_DELAY_MAX_MS` | `6000` | Max delay between requests |
| `SCRAPER_TIMEOUT_MS` | `45000` | Page load timeout |
| `SCRAPER_MAX_RETRIES` | `3` | Max retry attempts |

## Usage

```bash
# Basic search (2 pages, no LLM)
npm run research -- --query "Notion template life planner"

# Full run with Claude analysis
npm run research -- \
  --query "digital planner" \
  --pages 3 \
  --max-listings 100 \
  --use-llm \
  --currency USD \
  --country US

# Resume interrupted run
npm run research -- --query "budget tracker" --resume
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--query` | (required) | Search query |
| `--pages` | `2` | Number of search result pages |
| `--max-listings` | `80` | Max listings to process |
| `--currency` | `USD` | Target currency |
| `--country` | `US` | Region |
| `--language` | `en-US` | Browser language |
| `--headless` | `true` | Headless browser |
| `--concurrency` | `2` | Parallel processing |
| `--delay-min` | `2500` | Min delay (ms) |
| `--delay-max` | `6000` | Max delay (ms) |
| `--use-llm` | `false` | Enable Claude analysis |
| `--output` | `listings-full` | Output filename |
| `--resume` | `false` | Resume from checkpoint |

## Output Files

```
data/reports/
  listings-full.json      # Complete listing data
  listings-summary.csv    # Spreadsheet-ready summary
  market-analysis.json    # Claude analysis (if --use-llm)
  failed-listings.json    # Errors and failures
  run-metadata.json       # Run statistics
```

## Sales Score System

Each listing receives a score based on transparent factors:

| Factor | Points |
|--------|--------|
| Listing reviews 200+ | 3 |
| Listing reviews 50-199 | 2 |
| Listing reviews 10-49 | 1 |
| Shop sales 5000+ | 2 |
| Shop sales 500-4999 | 1 |
| Bestseller badge | +2 |
| Popular Now badge | +1 |
| Rating >= 4.8 | +1 |
| Top 10 organic position | +1 |

**Classification:**
- 0-2 points: Low
- 3-5 points: Medium
- 6+ points: High

## Running Without Claude API

The tool works fully without an API key. Simply omit `--use-llm`:

```bash
npm run research -- --query "Notion template"
```

All scraping, normalization, scoring, and CSV/JSON export work independently.

## Resuming Interrupted Runs

Use `--resume` to continue from the last checkpoint:

```bash
npm run research -- --query "wedding planner" --resume
```

Checkpoints are saved every 5 listings automatically.

## Limitations

- Etsy may block automated access; the tool pauses and reduces concurrency on detection
- Listing-specific review counts may not always be available
- Exact sales data is estimated, not exact
- Currency conversion uses fallback rates when API is unavailable
- HTML structure changes on Etsy may require selector updates

## Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

45 unit tests covering:
- Text cleaning and normalization
- URL normalization and deduplication
- Currency parsing (USD, EUR, GBP, etc.)
- Numeric value parsing
- Sales score calculation
- LLM response schema validation

## Development

```bash
npm run typecheck     # TypeScript check
npm run lint          # ESLint
npm run format        # Prettier
npm run dev           # Run with tsx (no build needed)
```

## HTTP API Server

The tool includes an HTTP API for running research via web requests:

```bash
# Start server
npm run server

# Health check
curl http://localhost:3000/health

# Start a research job
curl -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"query": "Notion template", "pages": 2, "maxListings": 50}'

# Check job status
curl http://localhost:3000/jobs/job-1

# List all jobs
curl http://localhost:3000/jobs
```

## Docker Deployment

```bash
# Build and start
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Google Cloud Engine Deployment

### 1. Create VM

```bash
gcloud compute instances create etsy-research \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --tags=allow-etsy-api
```

### 2. Open firewall

```bash
gcloud compute firewall-rules create allow-etsy-api \
  --allow tcp:3000 \
  --source-ranges 0.0.0.0/0 \
  --target-tags allow-etsy-api
```

### 3. SSH into VM and run setup

```bash
gcloud compute ssh etsy-research --zone=us-central1-a

# Clone and setup
git clone https://github.com/Murkin1980/etsy-market-research.git
cd etsy-market-research
bash deploy/gce-setup.sh

# Edit .env with your settings
nano .env

# Start
sudo systemctl start etsy-research
```

### 4. Verify

```bash
curl http://<EXTERNAL_IP>:3000/health
```

## Important

This tool is designed for market research purposes. Users are responsible for complying with Etsy's Terms of Service and robots.txt. The tool includes built-in rate limiting, randomized delays, and automatic pausing on detection.
