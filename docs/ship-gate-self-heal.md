# AG-031 / AG-034 — Ship-gate tip-red self-heal

## Problem

Auto-merge correctly **halts product merges** while default-branch tip CI is red (`default_branch_ci_red`).  
If Coppergate only audits the halt and never enqueues repair work, the dogfood loop deadlocks: no merges, no heal task, tip stays red.

AG-031 fixed enqueue. A second deadlock remained: heal PRs reached `DONE` / green checks but **auto-merge still skipped the entire merge pass**, so tip never greened without a human click (ACPP dogfood 2026-10-29).

A third deadlock: a single `REVIEW_REQUIRED` task stuck after `waiting_ci_timeout` (never accept-ready) counted as “busy,” so continuous backlog replan never refills.

## Behavior

1. **Heal enqueue (AG-031)** — On maintainer merge tick, when tip ship-gate is `red`, call `ensureShipGateHealTask`:
   - Creates (or reuses) a task titled `[ship-gate] Fix default-branch CI (<sha8>)`
   - Auto submit + approve so Arena can claim it
   - Goal/acceptance: make required `check` green on the default branch; no unrelated product scope
2. **Heal-only merge (AG-034)** — While tip is `red` and no ship-rollback PR is open, auto-merge still runs for candidates whose task title contains `[ship-gate]`. Product merges stay halted. Policy: `shipGateMergeMode` → `heal_only` | `halt` | `all`.
3. **Spend license** — `[ship-gate]` titles are allowed without an Open Program ID (system reliability, not freestyle invent). PR hygiene skill still forbids stacking product work while tip is red.
4. **Stale review** — After ~30m, non-accept-ready `REVIEW_REQUIRED` with a `waiting_ci_timeout` run gets `request_changes` so the board frees.
5. **Backlog idle** — Those same stale reviews do **not** count toward continuous-backlog `openWorkCount`.

## Non-goals

- Does **not** open product merges while tip is red or pending (only `[ship-gate]` heal titles).
- Does not invent product Open IDs for the heal title.
- Does not replace ship-rollback (revert PR) for post-merge CI fail of a Coppergate auto-merge.
- Tip `pending` and open rollback still **halt all** merges (including heal).

## Tests

- `packages/db/src/ship-gate-heal.test.ts` — title marker, busy-count, stale grace, `shipGateMergeMode`
- `packages/db/src/spend-license.test.ts` — heal title has no Open ID but is recognized
