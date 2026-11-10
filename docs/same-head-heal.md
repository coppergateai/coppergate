# Same-head heal — fix the delivery PR on its own branch

## Problem

- Red CI on a bot delivery PR only marked the run `ci_failed`; nothing acted until the ~6h `waiting_ci_timeout`, then a generic `stale_delivery` heal ran without knowing which check failed.
- "Same-head" heals (`stale_delivery`, `merge_conflict`) only *asked* the agent to push to the PR head. Delivery always cut a fresh `chore/cg-task-*` branch from main, so every heal opened a parallel PR (e.g. #216, #220, #228) instead of fixing the original one.

## Behavior

1. **Trigger (worker maintainer tick, L2 projects):** a `WAITING_CI` task whose delivery run is `ci_failed` gets a same-head **fix run on the same task** right away. The waiting_ci_timeout stale path (`REVIEW_REQUIRED`) also prefers a same-head run over the `stale_delivery` signal.
2. **Gate** (`decideSameHeadHeal`): skip while the arena is paused/killed, a run is still active, the failing check is in flake cooldown, or the PR already had `SAME_HEAD_MAX_ATTEMPTS` (2) same-head runs. Exhausted → the existing timeout → replan path frees the board.
3. **Arm** (`armSameHeadHealRun`): task → `QUEUED`; the delivery run → `FAILED` / `superseded_same_head`; new `fixer` run with `baseSha` = PR head SHA, `branchName` = PR head ref, idempotency `same_head:pr:<n>:<sha>`. Failing checks are recorded on the run (`same_head_heal` event) and audited (`same_head_heal.armed`).
4. **Execute:** sandbox checks out the PR head (not the default-branch tip); the prompt carries the failing checks plus their GitHub annotations.
5. **Deliver** (`pushToPullRequestBranch`): one commit onto the open PR's head with the old head as parent and a non-force ref update. Refuses if the PR is no longer open on that branch or its head moved (`same_head_conflict`). Never creates a branch or PR. Clients without the method fail closed.
6. Auto-accept prefers the newest same-head run over the superseded delivery (including a tournament WINNER).

## Not covered yet

- `merge_conflict` still uses its signal (parallel PR): resolving conflicts on the head needs a two-parent merge commit with the default branch.
- Check output comes from annotations only (no raw job logs).

## Tests

- `packages/db/src/same-head-heal.test.ts` — gate, transitions, run selection, prompt
- `packages/github/src/delivery.test.ts` — CAS push, closed PR, default branch, fake
- `apps/worker/src/same-head-heal.test.ts` — check run id parsing, annotation fetch
- `apps/worker/src/e2e-same-head-heal.test.ts` — red CI → same PR push ×2 → exhausted
