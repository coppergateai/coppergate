# Paid pilot outreach (Phase 0)

ICP: technical solo founder / indie hacker babysitting coding agents.

## 30-day targets

- 10–15 discovery calls
- 5–10 active concierge pilots
- ≥3 **paid** (deposit or monthly Starter)

## Outreach email (copy)

Subject: Agents fight; survivors open the PR

```
Hey {name},

Coppergate is a Survivor arena for coding agents: N contenders compete,
CI + cost decide the winner, losers lose budget. Humans set policy and
hold the kill-switch — not an approve-inbox.

Wedge for pilots: pick an open GitHub issue → get a verified PR with
evidence and spend.

We're taking 5–10 paid design partners this month ($49–99/mo Starter or
a one-time deposit). 30-min walkthrough?

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
- [x] Paid invite script ready (`create-pilot-invite.mjs … paid_pilot`) + billing smoke doc
- [ ] Invite redeem + GitHub App on low-risk repo (per pilot)
- [ ] Budget cap set (e.g. $25–50)
- [ ] Import one small issue → approve → PR
- [ ] User reviews in-product (diff, checks, cost)
- [ ] Share redacted delivery report link
- [ ] Schedule second issue within 7 days
- [ ] Record WTP / plan choice

## Go / no-go questions

Run `pnpm exec tsx scripts/pilot-go-no-go.mjs` and answer:

1. Did ≥1 workspace accept a **second** PR?
2. Are there ≥3 invites with kind `paid_pilot` redeemed (or Stripe checkouts)?
3. Is median cost per accepted PR known and explainable?

If no → keep selling issue→PR only; defer Survivor category push.
