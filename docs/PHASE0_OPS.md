# Phase 0 ops — 30-day paid proof

Master checklist for the $1M ARR path. Product north star stays Survivor; **cash** is hosted Starter/Pro via issue→verified PR.

| Doc | Role |
|---|---|
| [GTM.md](./GTM.md) | Strategy |
| [STRIPE_PRODUCTION.md](./STRIPE_PRODUCTION.md) | Live Stripe |
| [EMAIL.md](./EMAIL.md) | `hello@` inbox |
| [PILOT_OUTREACH.md](./PILOT_OUTREACH.md) | Copy + interview |
| [CONCIERGE_RUNBOOK.md](./CONCIERGE_RUNBOOK.md) | Per-pilot delivery |
| [ops/icp-40.csv](./ops/icp-40.csv) | 40 ICP rows |
| [LAUNCH_KIT.md](./LAUNCH_KIT.md) | Phase 1 distribution |

## Week 1 — kasa + liste

- [ ] `pnpm ops:stripe-env` green (Price IDs `price_…`, webhook secret)
- [ ] Prod webhook `https://www.coppergate.ai/api/billing/webhook` + Checkout smoke ([STRIPE_PRODUCTION.md](./STRIPE_PRODUCTION.md))
- [ ] `hello@` test receive ([EMAIL.md](./EMAIL.md))
- [ ] `pnpm ops:waitlist` — merge emails into `ops/icp-40.csv` rows 36–40
- [ ] `pnpm ops:outreach-pack` — creates `PAID-001…040` + outbox under `ops/_generated/`
- [ ] Send ≥20 emails / DMs from outbox; track `status=sent` in CSV

## Week 2–3 — concierge

For each redeemed pilot follow [CONCIERGE_RUNBOOK.md](./CONCIERGE_RUNBOOK.md):

```bash
pnpm ops:pilot-wtp -- PAID-00N starter --redeem --budget --first-pr
# after second accepted PR:
pnpm ops:pilot-wtp -- PAID-00N starter --second-pr
```

Target: **≥3 paid** (redeemed `paid_pilot` **or** Stripe Checkout) and **≥1 second accepted PR**.

## Week 4 — go / no-go

```bash
pnpm ops:pilot-go-no-go
```

- Exit `0` + `"go": true` → Phase 1 ([GTM.md](./GTM.md) + [launch/](./launch/))
- Exit `2` → narrow messaging to issue→PR only; keep concierge

## pnpm aliases

| Script | Command |
|---|---|
| `ops:stripe-env` | Stripe env shape check |
| `ops:waitlist` | Export waitlist JSON (+ `-- --csv`) |
| `ops:pilot-invite` | Create one invite |
| `ops:pilot-batch` | Batch `PAID-00N` |
| `ops:pilot-invites` | List invites |
| `ops:pilot-wtp` | Record WTP / checklist |
| `ops:pilot-go-no-go` | Go/no-go snapshot |
| `ops:outreach-pack` | ICP → invites + outbox |
| `ops:retention` | Retention snapshot |
