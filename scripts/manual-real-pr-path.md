# Manual real-PR path (TASK029 / TASK033)

Automated CI covers the **FakeAgent** happy path (`apps/worker/src/e2e-happy-path.test.ts`).
Use this checklist when verifying against a staged GitHub App + real repository.
Full staging deploy notes: [`docs/STAGING.md`](../docs/STAGING.md).

## Prerequisites

- Coppergate GitHub App installed on a throwaway org/user
- Staging env per `docs/STAGING.md` (incl. `GITHUB_DELIVERY_MODE=http` on the worker)
- Worker running with the same `DATABASE_URL` + `CREDENTIALS_ENCRYPTION_KEY` as web
- Optional: `LLM_API_KEY` for the real coding agent; omit to stay on FakeCodingAgent
- Smoke: `STAGING_URL=https://… node scripts/staging-smoke.mjs`

## Steps

1. Sign in → create workspace → **Install GitHub App** → connect one repo.
2. Create project bound to that repo; set budget cap and autonomy ≥ L1.
3. Generate + approve product brief.
4. Generate plan; submit a small scoped task; approve → queue.
5. Confirm worker claims the run; watch task detail for events / cost.
6. Open the delivered PR on GitHub; confirm checks / validation evidence on the run.
7. On review screen: confirm **Delivery for review** (diff summary + delivery report).
8. **Accept** → task `DONE`. Optionally cancel a second run and **Retry** to exercise recovery.

## Pass criteria

- [ ] PR opened on a non-default branch (`coppergate/task-…`)
- [ ] Validation / CI evidence visible; accept blocked if checks fail
- [ ] Diff summary shows changed files without secrets
- [ ] Cost reflected in project usage
- [ ] Accept → DONE without operator intervention
