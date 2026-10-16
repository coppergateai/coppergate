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

- [ ] Repo connected + GitHub App install
- [ ] Spend cap set; arena funded
- [ ] Brief approved (required before issue import)
- [ ] Import open issue from product UI (not seed SQL)
- [ ] Task queued → worker claims (`GITHUB_DELIVERY_MODE=http`, OpenHands or BYOK)
- [ ] Live PR opens with `Closes #N`
- [ ] CI evidence visible on task review (check_run webhook → `ingestCiEvidence`)
- [ ] Accept disabled while CI pending or failed; enabled when green
- [ ] Accept → DONE in-product

Sonar / CI-fail seed scripts remain for the **secondary** signal vertical — see [SIGNALS.md](./SIGNALS.md) and [STAGING.md](./STAGING.md).
