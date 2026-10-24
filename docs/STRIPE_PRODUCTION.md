# Stripe production runbook (Phase 0 → Phase 1)

Internal Stripe SKUs remain **Starter $99/mo** and **Pro $199/mo** (+ usage metadata) in `@coppergate/billing` `HOSTED_PLANS`. **Public paid pricing is deferred** (`PUBLIC_PAID_PRICING_ENABLED=false`) — do not expose checkout or $99/$199 UI until product reopens pricing. Price IDs live in env.

Local smoke: [`scripts/manual-billing-smoke.md`](../scripts/manual-billing-smoke.md).  
Env check: `pnpm ops:stripe-env`.

## 1) Dashboard products

1. Stripe Dashboard → **Live** mode (not test) when wiring `www.coppergate.ai`.
2. Products:
   - **Coppergate Starter** — recurring monthly **$99** USD → copy `price_…` → `STRIPE_PRICE_STARTER`
   - **Coppergate Pro** — recurring monthly **$199** USD → copy `price_…` → `STRIPE_PRICE_PRO`
3. Use **Price IDs** (`price_…`), never Product IDs (`prod_…`).
4. Customer Portal: enable payment method update + cancel at period end. Return URL base = `APP_URL`.

## 2) Webhook endpoint

| Field | Value |
|---|---|
| URL | `https://www.coppergate.ai/api/billing/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |

Copy signing secret → `STRIPE_WEBHOOK_SECRET` (rotate if you recreate the endpoint).

## 3) Vercel / host env

```bash
STRIPE_SECRET_KEY=sk_live_…          # or sk_test_… on staging
STRIPE_WEBHOOK_SECRET=whsec_…
STRIPE_PRICE_STARTER=price_…
STRIPE_PRICE_PRO=price_…
APP_URL=https://www.coppergate.ai
# Optional (Checkout is server redirect; unused by Elements today)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
```

Redeploy web after env change. Confirm `pnpm ops:stripe-env` against the same values (locally via `.env` or exported vars).

## 4) Production smoke

1. Owner workspace → **Settings → Billing** → Checkout **Starter** (real card or Stripe test clock on staging).
2. Return `?tab=billing&checkout=success` — plan becomes `starter` / `active`.
3. **Manage billing** opens Customer Portal.
4. Stripe Dashboard → webhook delivery **200** for `checkout.session.completed`.
5. Cancel or incomplete invoice → status syncs (`past_due` on payment failure).

API: `POST /api/workspaces/:id/billing` `{ "action": "checkout", "plan": "starter" }` · portal `{ "action": "portal" }`.

## 5) Paid pilots

Invites (`paid_pilot`) gate private beta; Stripe Checkout is the cash register.

```bash
pnpm ops:waitlist
pnpm ops:pilot-invite -- PAID-001 1 paid_pilot
pnpm ops:pilot-go-no-go
```

See [PHASE0_OPS.md](./PHASE0_OPS.md) and [PILOT_OUTREACH.md](./PILOT_OUTREACH.md).
