# AG-031 — Ship-gate tip-red self-heal

## Problem

Auto-merge correctly **halts** while default-branch tip CI is red (`default_branch_ci_red`).  
If Coppergate only audits the halt and never enqueues repair work, the dogfood loop deadlocks: no merges, no heal task, tip stays red.

A second deadlock: a single `REVIEW_REQUIRED` task stuck after `waiting_ci_timeout` (never accept-ready) counted as “busy,” so continuous backlog replan never refills.

## Behavior

1. **Heal enqueue** — On maintainer merge tick, when tip ship-gate is `red`, call `ensureShipGateHealTask`:
   - Creates (or reuses) a task titled `[ship-gate] Fix default-branch CI (<sha8>)`
   - Auto submit + approve so Arena can claim it
   - Goal/acceptance: make required `check` green on the default branch; no unrelated product scope
2. **Spend license** — `[ship-gate]` titles are allowed without an Open Program ID (system reliability, not freestyle invent). PR hygiene skill still forbids stacking product work while tip is red.
3. **Stale review** — After ~30m, non-accept-ready `REVIEW_REQUIRED` with a `waiting_ci_timeout` run gets `request_changes` so the board frees.
4. **Backlog idle** — Those same stale reviews do **not** count toward continuous-backlog `openWorkCount`.

## Non-goals

- Does not bypass the ship gate (merges stay halted until tip is green).
- Does not invent product Open IDs for the heal title.
- Does not replace ship-rollback (revert PR) for post-merge CI fail of a Coppergate auto-merge.

## Tests

- `packages/db/src/ship-gate-heal.test.ts` — title marker, busy-count, stale grace
- `packages/db/src/spend-license.test.ts` — heal title has no Open ID but is recognized
