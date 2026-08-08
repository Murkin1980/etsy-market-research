# Paddle seller activation checklist (Stage 12)

The Paddle integration is implemented and tested in the application (`src/billing/paddle.ts`,
`src/billing/billing-store.ts`, `POST /billing/checkout`, `POST /webhooks/paddle`). This document
covers the manual seller-side activation that remains: create the Paddle account, products,
recurring prices, a default payment link, and a webhook destination, then publish the five
`PADDLE_*` values through Google Secret Manager.

Record of completed steps and resource names should be added here. Do not store API keys, webhook
secrets, price identifiers, or billing identifiers in this repository.

## What the application expects

From `src/config/env.ts` and `src/billing/paddle.ts`:

| Variable | Meaning | Required for checkout |
| --- | --- | --- |
| `PADDLE_ENVIRONMENT` | `sandbox` or `production` (default `sandbox`) | — |
| `PADDLE_API_KEY` | Paddle client API key used to create transactions | yes |
| `PADDLE_WEBHOOK_SECRET` | Secret configured on the webhook destination, used to verify signatures | yes |
| `PADDLE_PRICE_PRO` | Paddle price ID for the Pro plan ($19/month) | yes |
| `PADDLE_PRICE_STUDIO` | Paddle price ID for the Studio plan ($49/month) | yes |

`paddleConfigured()` (in `src/billing/paddle.ts`) returns `true` only when `PADDLE_API_KEY`,
`PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_PRO`, and `PADDLE_PRICE_STUDIO` are all set. Until then the
health endpoint reports `billing: trial-only`, the tariff screen shows the safe unavailable-payment
state, and `POST /billing/checkout` returns an error.

The app creates transactions through:

- sandbox base URL: `https://sandbox-api.paddle.com`
- production base URL: `https://api.paddle.com`
- one item `{ price_id: <price>, quantity: 1 }`, `collection_mode: automatic`
- `custom_data.signal_lab_account_id` and `custom_data.signal_lab_plan_id` (must survive into webhook events)

Webhook handling accepts `subscription.*` events, maps the price ID back to the plan, and applies
lifecycle changes (active, past_due, canceled) with HMAC-SHA256 verification over the exact raw
body, a five-second timestamp tolerance, and event-id deduplication.

## Step 1 — Sandbox activation

1. Create a Paddle sandbox seller account at <https://sandbox-vendors.paddle.com>.
2. In **Developer Tools → Authentication**, create a client API key with transaction scope. Save the
   value only to Secret Manager / `.env.local` (never to this repo).
3. In **Products**, create two products, e.g. `Signal Lab Pro` and `Signal Lab Studio`.
4. For each product create a single **recurring price**:
   - Pro → `19` USD per month.
   - Studio → `49` USD per month.
5. Copy each **price ID** (`pri_...`) — these are `PADDLE_PRICE_PRO` and `PADDLE_PRICE_STUDIO`.
6. In **Developer Tools → Webhooks**, create a destination:
   - URL: `https://34-18-107-101.sslip.io/webhooks/paddle`
   - Events: enable at least the `subscription.*` event types (`subscription.created`,
     `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`,
     `subscription.payment_failed`, `subscription.payment_succeeded`).
   - Copy the generated **webhook secret** (`whsec_...`) — this is `PADDLE_WEBHOOK_SECRET`.
7. **Test in sandbox** before touching production:
   - Set the five `PADDLE_*` values for sandbox and restart the service.
   - Confirm `/health` reports `billing: paddle`.
   - In the tariff screen choose a paid plan and confirm a `checkout.paddle.com` URL opens.
   - Complete a sandbox checkout and confirm the webhook applies the plan (`GET /billing/status`).

## Step 2 — Publish secrets to Google Secret Manager

All Paddle values are runtime environment variables. Add them to the existing environment secret so
they are picked up with the next container restart:

```bash
# Edit the latest version of the production env secret (add the PADDLE_* lines),
# then add the new version:
gcloud secrets versions add etsy-production-env \
  --project=etsy-research-prod-2026 \
  --data-file=etsy-production-env.txt
```

On the VM reload and restart:

```bash
gcloud secrets versions access latest \
  --secret=etsy-production-env \
  --project=etsy-research-prod-2026 \
  | sudo tee /opt/etsy-research/.env >/dev/null
sudo chmod 600 /opt/etsy-research/.env
sudo systemctl restart etsy-research
```

Confirm the change:

```bash
curl --fail --silent https://34-18-107-101.sslip.io/health
```

Expected: the health payload now shows `"billing": "paddle"`.

## Step 3 — Production activation

1. Create the production Paddle seller account at <https://vendors.paddle.com>.
2. Repeat Step 1 (steps 2–6) in the production dashboard, using the same product/price model.
3. Publish the production `PADDLE_*` values through the same Secret Manager flow (Step 2), with
   `PADDLE_ENVIRONMENT=production`.
4. Smoke-test the real journey on the public site: register → verify email → open tariff →
   start a checkout → complete it → confirm the subscription applies and quota unlocks.
5. Record the completion in this file and in `PROJECT_STATUS.md`.

## Notes

- `custom_data` values must be present in webhook payloads; keep them primitive strings
  (`signal_lab_account_id`, `signal_lab_plan_id`) as the app currently reads them.
- Price changes on Paddle are separate price objects. If prices change, update
  `PADDLE_PRICE_PRO` / `PADDLE_PRICE_STUDIO` and keep `paddle.ts` price-to-plan mapping aligned.
- Never rotate `PADDLE_WEBHOOK_SECRET` without updating the secret store first; webhooks are
  rejected for five seconds of clock skew and for any signature mismatch.
- Canceled subscriptions are downgraded to the trial plan server-side (`billing-store.ts`).
