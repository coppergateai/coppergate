# Phase 0 — Stripe billing + paid invite smoke

Production checklist: architecture [`docs/STRIPE_PRODUCTION.md`](../../coppergate-architecture/docs/STRIPE_PRODUCTION.md).  
Env shape: `pnpm ops:stripe-env`.

## Env (web)

```bash
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…          # from `stripe listen` locally, or Dashboard endpoint
STRIPE_PRICE_STARTER=price_…           # NOT prod_…
STRIPE_PRICE_PRO=price_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
APP_URL=http://localhost:3000          # or https://www.coppergate.ai
```

Prices must match **Starter $99** and **Pro $199** in `@coppergate/billing` `HOSTED_PLANS` / architecture [`docs/GTM.md`](../../coppergate-architecture/docs/GTM.md) (public paid UI deferred).

## Local webhook forward

```bash
stripe listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to localhost:3000/api/billing/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`, restart web.

## Checkout smoke

1. Sign in → workspace → **Settings → Billing**.
2. Owner clicks **Starter** or **Pro** → Stripe Checkout (test card `4242…`).
3. Return URL `?tab=billing&checkout=success` — panel polls until plan ≠ community.
4. **Manage billing** opens Customer Portal when a Stripe customer exists.

API: `POST /api/workspaces/:id/billing` `{ action: "checkout"|"portal", plan? }` · webhook `POST /api/billing/webhook`.

## Paid invite + go/no-go

```bash
pnpm ops:pilot-invite -- PAID-SMOKE-001 1 paid_pilot
pnpm ops:pilot-invites
pnpm ops:waitlist
pnpm ops:waitlist -- --csv
pnpm ops:pilot-go-no-go
```

Set `PILOT_INVITE_REQUIRED=true` on staging when gating signups. Outreach: architecture [`PILOT_OUTREACH.md`](../../coppergate-architecture/docs/PILOT_OUTREACH.md) · master ops: [`PHASE0_OPS.md`](../../coppergate-architecture/docs/PHASE0_OPS.md).
