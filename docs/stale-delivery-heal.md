# AG-033 — stale open PR heal instead of replan

## Problem

After `waiting_ci_timeout`, AG-031 freed the board with `request_changes` → `NEEDS_REPLAN`. AG-032 salvages **dirty** open PRs via `merge_conflict`. Clean (or unknown) open PRs still got abandoned — inventing a new cycle while a salvageable head sat open.

## Behavior

1. **Stale gate** — same AG-031 policy: `REVIEW_REQUIRED`, `waiting_ci_timeout`, not accept-ready, stale ≥ ~30m.
2. **Route** (`routeStaleReviewHeal`):
   - no PR number → `NEEDS_REPLAN`
   - open + dirty → `merge_conflict` (AG-032)
   - open + clean/unknown → `stale_delivery` heal (this AG)
   - closed / merged → `NEEDS_REPLAN`
3. **Heal** — ingest provider `stale_delivery`, auto-arm `fixer` + `engineer`, same head branch, keep parent Open ID in the title.
4. **Merge-state API fail** — if PR number is known but GitHub merge-state check fails, still prefer `stale_delivery` over replan.

Emitted from:

- Stale CI-timeout review heal (`healStaleReviewsOrEmitConflict`)

## Non-goals

- Human product-scope `request_changes` (still NEEDS_REPLAN)
- Vision / continuous backlog invent when the board is truly idle
- Silent force-push without an agent

## Tests

- `packages/db/src/stale-delivery-heal-signal.test.ts`
