# Manual signal closed loop (Sonar ∥ CI-fail)

Automated proof: `apps/worker/src/e2e-signal-closed-loop.test.ts` (via `scripts/signal-closed-loop-smoke.mjs`).
Use this checklist for **staging** against a live GitHub App + throwaway repo.

## Prerequisites

- Staging stack per architecture [`docs/STAGING.md`](../../coppergate-architecture/docs/STAGING.md) (`GITHUB_DELIVERY_MODE=http`)
- Workspace: GitHub App installed, repo connected, budget, autonomy ≥ L1
- Approved product brief on the project
- Arena armed with contender budgets (`ensureArenaForProject` / UI)
- Auto-arm rule for `sonar` and/or `ci_failure` (`minSeverity=high`)
- Optional worker: `SANDBOX_MODE=local`, `CONTENDER_HARNESS=openhands`

## Steps

1. `STAGING_URL=https://www.coppergate.ai node scripts/staging-smoke.mjs`
2. Seed (preferred):

   ```bash
   DATABASE_URL=… SIGNAL_PROVIDER=sonar \
     node --import tsx apps/worker/scripts/seed-signal-closed-loop.mjs
   ```

   Or as workspace owner, `POST /api/workspaces/:id/signals/ingest` with a high-severity `sonar` / `ci_failure` envelope (see [`docs/SIGNALS.md`](../docs/SIGNALS.md)).
3. Confirm signal status `armed` and a task appears (READY_FOR_APPROVAL or QUEUED).
4. Approve if needed; confirm worker claims a run (sandbox event + delivery).
5. Open the PR on the smoke repo; confirm `diff_summary` + `delivery_report` in-product.
6. Confirm fitness: live CI/Sonar webhook on `http` delivery, or synthetic fitness on `fake` delivery for signal-sourced runs.
7. **Accept** → task `DONE`.

## Pass criteria

- [x] Signal auto-arms without operator SQL (seed / ingest)
- [x] Sandbox id recorded on the run (`SANDBOX_MODE=local`)
- [x] PR on `coppergate/task-…` (never default branch) — [PR #2](https://github.com/coppergateai/coppergate-staging-smoke/pull/2)
- [x] Fitness evidence path: fake delivery attaches synthetic fitness; live `http` awaits CI/Sonar webhooks
- [x] Accept → DONE — `LOOKUP_PR_URL=…/pull/2` + `accept-task-review.mjs` (2026-10-16); Bitbucket/ADO **not** required (deferred)
- [x] PR file bodies from sandbox workdir (not README stub) — [PR #3](https://github.com/coppergateai/coppergate-staging-smoke/pull/3) `app/page.tsx` OpenHands content
- [x] Fly worker image includes harness env (`fly.toml` + `fly deploy` 2026-10-16) — see [`fly-signal-closed-loop.md`](./fly-signal-closed-loop.md)

## Explicitly deferred

- Bitbucket / Azure DevOps live PR delivery
- SSO / SCIM live IdP
- Claiming “production ready” before TASK129 go/no-go
