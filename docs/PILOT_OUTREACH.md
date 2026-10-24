# Design-partner outreach (Phase 0)

ICP: technical solo founder / indie hacker babysitting coding agents.

Master ops: [PHASE0_OPS.md](./PHASE0_OPS.md) · ICP sheet: [ops/icp-40.csv](./ops/icp-40.csv) · Concierge: [CONCIERGE_RUNBOOK.md](./CONCIERGE_RUNBOOK.md).

**Pricing note (2026-10-24):** Public paid tiers are off. Outreach is for
**design partners** on the free / self-host / hosted demo path — do not sell
Starter $99 / Pro $199 until product reopens paid plans.

## 30-day targets

- 10–15 discovery calls
- 5–10 active concierge design partners
- ≥3 partners who complete issue → verified PR in one session

## Generate outbox

```bash
# Merge waitlist emails into icp-40.csv rows 36–40 first
pnpm ops:waitlist -- --csv

# Creates outreach rows + docs/ops/_generated/outreach-outbox.md
pnpm ops:outreach-pack
```

Send from `hello@coppergate.ai`. Mark `status=sent` in the CSV.

## Outreach email (copy)

Subject: Agents compete; survivors open the PR

```
Hey {name},

Coppergate is a Survivor arena for coding agents: N contenders compete,
CI + cost decide the winner, losers lose budget. Humans set policy and
hold the kill-switch — not an approve-inbox.

Wedge: pick an open GitHub issue → get a verified PR with evidence and
spend. MIT open source — self-host free, or try the hosted demo.

We're onboarding a small set of design partners this month (no paid plan
required). Walkthrough invite: {INVITE-XXX}

30-min session?

— Coppergate · coppergate.ai · hello@coppergate.ai
```

## Interview script (20–30 min)

1. How do you coordinate AI coding tools today? Where do you babysit?
2. Last time an agent opened a PR — what broke (CI, scope, cost, merge)?
3. Would issue → verified PR with a hard spend cap change that?
4. Self-host vs hosted demo preference?
5. What would make you run a second issue within 7 days?

## After the call

- Concierge: [CONCIERGE_RUNBOOK.md](./CONCIERGE_RUNBOOK.md)
- Path to first PR: spend cap → Import → queue → Accept with CI green
- Book second issue ≤7 days; capture qualitative notes only (no paid upsell)
