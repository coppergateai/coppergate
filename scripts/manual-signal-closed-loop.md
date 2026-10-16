# Manual signal closed loop (Sonar ∥ CI-fail)

Automated proof: `apps/worker/src/e2e-signal-closed-loop.test.ts` (via `scripts/signal-closed-loop-smoke.mjs`).
Use this checklist for **staging** against a live GitHub App + throwaway repo.

## Prerequisites

- Staging stack per [`docs/STAGING.md`](../docs/STAGING.md) (`GITHUB_DELIVERY_MODE=http`)
- Workspace: GitHub App installed, repo connected, budget, autonomy ≥ L1
- Approved product brief on the project
- Arena armed with contender budgets (`ensureArenaForProject` / UI)
- Auto-arm rule for `sonar` and/or `ci_failure` (`minSeverity=high`)
- Optional worker: `SANDBOX_MODE=local`, `CONTENDER_HARNESS=openhands`

## Steps

1. `STAGING_URL=https://www.coppergate.ai node scripts/staging-smoke.mjs`
2. As workspace owner, `POST /api/workspaces/:id/signals/ingest` with a high-severity `sonar` or `ci_failure` envelope (see [`docs/SIGNALS.md`](../docs/SIGNALS.md)).
3. Confirm signal status `armed` and a task appears (READY_FOR_APPROVAL or QUEUED).
4. Approve if needed; confirm worker claims a run (sandbox event + delivery).
5. Open the PR on the smoke repo; confirm `diff_summary` + `delivery_report` in-product.
6. Confirm fitness attach: CI check evidence and/or Sonar quality-gate artifact on the run.
7. **Accept** → task `DONE`.

## Pass criteria

- [ ] Signal auto-arms without operator SQL
- [ ] Sandbox id recorded on the run (`SANDBOX_MODE=local`)
- [ ] PR on `coppergate/task-…` (never default branch)
- [ ] Fitness evidence attached (CI and/or Sonar)
- [ ] Accept → DONE; Bitbucket/ADO **not** required (deferred)

## Explicitly deferred

- Bitbucket / Azure DevOps live PR delivery
- SSO / SCIM live IdP
- Claiming “production ready” before TASK129 go/no-go
