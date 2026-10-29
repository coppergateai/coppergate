# AG-032 — merge_conflict signal instead of replan

## Problem

A delivery PR can sit in `REVIEW_REQUIRED` after `waiting_ci_timeout` while GitHub reports **CONFLICTING** / `mergeable_state=dirty`. AG-031’s stale path used to `request_changes` → `NEEDS_REPLAN`, inventing new work and abandoning the open PR.

## Behavior

1. **Detect dirty PR** — `getPullRequestMergeState` returns `mergeable` + `mergeable_state`.
2. **Prefer heal** — `shouldEmitMergeConflictInsteadOfReplan` is true when the PR is open and dirty.
3. **Ingest** — provider `merge_conflict`, `externalId = pr:{owner}/{repo}:{n}` (dedupe).
4. **Auto-arm** — default rule arms `fixer` + `engineer` to rebase the **same head branch** and keep the parent Open ID in the title.
5. **Fallback** — only if there is no healable open PR, keep AG-031 `request_changes` → `NEEDS_REPLAN`.

Emitted from:

- Stale CI-timeout review heal (`healStaleReviewsOrEmitConflict`)
- Auto-merge “not mergeable” when the PR is dirty

## Non-goals

- Silent git merge / force-push without an agent
- Closing the parent task when the conflict signal arms

## Tests

- `packages/db/src/merge-conflict-signal.test.ts`
- `packages/github/src/pulls.test.ts` — mergeable_state mapping
