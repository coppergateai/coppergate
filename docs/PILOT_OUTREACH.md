# Paid pilot outreach (Phase 0)

ICP: technical solo founder / indie hacker babysitting coding agents.

Master ops: [PHASE0_OPS.md](./PHASE0_OPS.md) · ICP sheet: [ops/icp-40.csv](./ops/icp-40.csv) · Concierge: [CONCIERGE_RUNBOOK.md](./CONCIERGE_RUNBOOK.md).

## 30-day targets

- 10–15 discovery calls
- 5–10 active concierge pilots
- ≥3 **paid** (deposit or monthly Starter $99 / Pro $199)

## Generate outbox

```bash
# Merge waitlist emails into icp-40.csv rows 36–40 first
pnpm ops:waitlist -- --csv

# Creates PAID-001…040 (if missing) + docs/ops/_generated/outreach-outbox.md
pnpm ops:outreach-pack
```

Send from `hello@coppergate.ai`. Mark `status=sent` in the CSV.

## Outreach email (copy)

Subject: Agents fight; survivors open the PR

```
Hey {name},

Coppergate is a Survivor arena for coding agents: N contenders compete,
CI + cost decide the winner, losers lose budget. Humans set policy and
hold the kill-switch — not an approve-inbox.

Wedge for pilots: pick an open GitHub issue → get a verified PR with
evidence and spend.

We're taking 5–10 paid design partners this month ($99/mo Starter, $199
Pro, or a one-time deposit). Invite: {PAID-XXX}

30-min walkthrough?

— Coppergate · coppergate.ai · hello@coppergate.ai
```

## Interview script (20–30 min)

1. How do you coordinate AI coding tools today? Where do you babysit?
2. Last time an agent opened a PR — what broke (CI, scope, cost, merge)?
3. Would you pay for **issue → verified PR** with a hard spend cap? How much?
4. Show 90s demo: arm arena → contenders → survivor PR + cost.
5. Ask for second task commit + paid trial/deposit. Compliments ≠ demand.

## Concierge checklist

- [x] Staging wedge proven (issue → PR → CI → Accept) — [PR #5](https://github.com/coppergateai/coppergate-staging-smoke/pull/5) (2026-10-17)
- [x] Paid invite scripts (`ops:pilot-invite`, `ops:outreach-pack`, `ops:pilot-wtp`)
- [ ] Invite redeem + GitHub App on low-risk repo (per pilot)
- [ ] Budget cap set (e.g. $25–50)
- [ ] Import one small issue → approve → PR
- [ ] User reviews in-product (diff, checks, cost)
- [ ] Share redacted delivery report link
- [ ] Schedule second issue within 7 days
- [ ] Record WTP / plan choice (`pnpm ops:pilot-wtp -- CODE starter|pro|deposit`)

## Go / no-go questions

Run `pnpm ops:pilot-go-no-go` and answer:

1. Did ≥1 workspace accept a **second** PR?
2. Are there ≥3 `paid_pilot` redemptions **or** ≥3 active/trialing Stripe subscriptions?
3. Is median cost per accepted PR known and explainable?

If no → keep selling issue→PR only; defer Survivor category push.
