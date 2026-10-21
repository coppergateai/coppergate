# Concierge runbook (paid pilots)

Every pilot must finish with **PR + evidence + cost in-product**. Compliments ≠ demand.

## Per-pilot checklist

| Step | Done when | Record |
|---|---|---|
| 1. Redeem | Invite used; workspace exists | `pnpm ops:pilot-wtp -- CODE starter --redeem --name "…"` |
| 2. GitHub App | Low-risk repo connected | — |
| 3. Budget | Cap $25–50 active | `--budget` |
| 4. Brief | Approved if required | — |
| 5. First issue | Import → queue → PR → CI → Accept | `--first-pr` |
| 6. Share | Redacted report link shared | — |
| 7. Second issue | Within 7 days; Accept | `--second-pr` |
| 8. WTP | `starter` / `pro` / `deposit` | third argv to `ops:pilot-wtp` |

Staging wedge proof (platform): [WEDGE.md](./WEDGE.md) — issue #4 → PR #5 on coppergate-staging-smoke.

## Session script (45–60 min)

1. Screen-share **Path to first PR** onboarding on their project.
2. Import one **tiny** open issue (single file / clear acceptance).
3. Watch worker → REVIEW_REQUIRED; explain Accept gate vs CI.
4. Accept → DONE; show cost ledger.
5. Book second issue in ≤7 days; ask Starter $99 vs deposit.

## Failure recovery (self-serve)

Point them to [/docs/recovery](/docs/recovery) before hopping on Slack. Operator only if sandbox/App misconfigured.

## Anti-patterns

- Doing the Accept click for them without them seeing cost/CI
- Starting with idea→brief tournament instead of issue wedge
- Lifetime free “friends & family” without WTP ask
