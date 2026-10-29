# Flake retry cooldown (AG-021)

When required CI checks **pass and fail within a short window** (flake pattern), Coppergate must not spam **Retry** or unattended **stale_delivery** heal / replan on every maintainer tick.

## Behavior

| Signal | Action |
| --- | --- |
| `detectFlakePattern` on run CI history (`@coppergate/signals`) | Treat as flaky oscillation |
| Last `task.retry`, `review.stale_ci_timeout_heal`, or `review.stale_ci_timeout_replan` on the task within **30m** | Defer another Retry or unattended heal/replan |
| Cooldown elapsed | Allow one more Retry/heal; Accept stays fail-closed until CI is stable green (AG-017) |

Human **Retry** from Evidence Center receives a **409 policy** message with approximate wait time when deferred.

Worker **stale review heal** logs `flake cooldown — skip unattended heal/replan` and counts `flakeCooldownSkipped` on the maintainer tick.

## Code

- Policy: `packages/db/src/flake-retry-cooldown.ts`
- Retry API guard: `retryFailedTask` in `packages/db/src/task-transitions.ts`
- Worker: `apps/worker/src/stale-review-heal.ts`
