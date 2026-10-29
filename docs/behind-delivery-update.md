# Behind delivery auto-update (AG-036)

Strict branch protection (`required_status_checks.strict`) blocks merge while a PR is **behind** main even when CI on the tip is green. AG-032 only heals **dirty** (conflicts). Accept-ready + behind previously stalled forever because board drain skipped PR inspect when `acceptReady`.

## Behavior

| Gate | When | Action |
| --- | --- | --- |
| Board drain inspect | WAITING_CI / REVIEW after ~15m grace | Inspect even when accept-ready |
| Behind | `mergeable_state=behind` | `PUT …/update-branch` |
| Update conflict | update-branch 422 | Arm `merge_conflict` Fixer (same head) |
| Dirty | `mergeable_state=dirty` | AG-032 / AG-035 path unchanged |
| Auto-merge fail | not-mergeable + behind | Same update-branch → conflict→Fixer |
| Arena label | run `REVIEW_REQUIRED` | **Awaiting merge** (not Awaiting CI) |

## Non-goals

- Does not disable strict protection
- Does not invent Open IDs
- Clean + accept-ready still lands via auto-merge

## Evidence

- `packages/github/src/pulls.test.ts` (`updatePullRequestBranch`)
- `packages/db/src/merge-conflict-signal.test.ts` (`isBehindMergeState`)
- `packages/db/src/ship-gate-heal.test.ts` (acceptReady still inspects)
