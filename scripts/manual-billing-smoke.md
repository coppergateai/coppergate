# Phase 0 — Stripe billing + paid invite smoke

## Env (web)

```bash
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…          # from `stripe listen` locally, or Dashboard endpoint
STRIPE_PRICE_STARTER=price_…
STRIPE_PRICE_PRO=price_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…
APP_URL=http://localhost:3000          # or https://www.coppergate.ai
```

Prices should match Starter ~$99 and Pro ~$199 hypotheses in [`docs/GTM.md`](../docs/GTM.md) / `@coppergate/billing` `HOSTED_PLANS`.

## Local webhook forward

```bash
stripe listen \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted \
  --forward-to localhost:3000/api/billing/webhook
```

Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`, restart web.

## Checkout smoke

1. Sign in → workspace → **Settings → Billing**.
2. Owner clicks **Starter** or **Pro** → Stripe Checkout (test card `4242…`).
3. Return URL `?tab=billing&checkout=success` — panel polls until plan ≠ community.
4. **Manage billing** opens Customer Portal when a Stripe customer exists.

API: `POST /api/workspaces/:id/billing` `{ action: "checkout"|"portal", plan? }` · webhook `POST /api/billing/webhook`.

## Paid invite

```bash
DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/create-pilot-invite.mjs PAID-SMOKE-001 1 paid_pilot
DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/list-pilot-invites.mjs
DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/list-waitlist.mjs
DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/pilot-go-no-go.mjs
```

Set `PILOT_INVITE_REQUIRED=true` on staging when gating signups. Outreach copy: [`docs/PILOT_OUTREACH.md`](../docs/PILOT_OUTREACH.md).
