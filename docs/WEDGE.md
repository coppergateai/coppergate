# Product wedge lock (D14)

**Locked commercial wedge:** existing-repository **GitHub issue → verified PR**.

| Path | Role |
|---|---|
| Issue import → task → sandbox → PR + CI + cost → review | **Primary** — measure TTFV and WTP here |
| Idea → brief → plan → task | Signature **demo** / new-product mode — not the paid pilot KPI |
| Sentry / CI-fail / Sonar → auto-arm → fix PR | **Secondary vertical** — one closed loop each, not ten adapters |

## Onboarding (product)

Default guide title: **Path to first PR**

1. Set spend cap  
2. Import a GitHub issue (project → Issues → **Import → queue**)  
3. Approve / queue (min_human arenas auto-queue)  
4. Review survivor PR — cost, diff summary, and live CI evidence in one view  
5. Accept → DONE (blocked until CI passes when live delivery awaits checks)

Brief/plan remains available under Overview / Delivery for new-product workspaces.

## Fitness

GitHub PR + CI remains the fitness surface. Quality/runtime signals (Sentry, Sonar, …) feed the arena; they do not replace CI as the promotion gate for the wedge.

## Pilot checklist (issue path)

- [x] Repo connected + GitHub App install
- [x] Spend cap set; arena funded
- [x] Brief approved (required before issue import)
- [x] Import open issue via product APIs (`importGithubIssueAsTask` / Issues **Import → queue**) — [issue #4](https://github.com/coppergateai/coppergate-staging-smoke/issues/4) (2026-10-17)
- [x] Task queued → worker claims (`GITHUB_DELIVERY_MODE=http`, OpenHands)
- [x] Live PR opens with `Closes #N` — [PR #5](https://github.com/coppergateai/coppergate-staging-smoke/pull/5)
- [x] CI evidence attached (`ingestCiEvidence` / check_run path) on task review
- [x] Accept disabled while CI pending or failed; enabled when green
- [x] Accept → DONE — proven 2026-10-17 (`prove-issue-wedge.mjs` + negative CI reject)

Operator proof script: [`apps/worker/scripts/prove-issue-wedge.mjs`](../apps/worker/scripts/prove-issue-wedge.mjs) · notes: [`scripts/manual-issue-wedge.md`](../scripts/manual-issue-wedge.md).

Sonar / CI-fail seed scripts remain for the **secondary** signal vertical — see [SIGNALS.md](./SIGNALS.md) and [STAGING.md](./STAGING.md).
