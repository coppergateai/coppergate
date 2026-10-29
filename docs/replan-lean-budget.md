# AG-025 — Replan lean budget under $1

When a project’s **available** envelope drops below **$1** (`1_000_000` micros), maintainer **vision replan** throttles fan-out:

1. **`maxAutoQueue`** — at most **one** root task is auto-submitted per replan, even when policy `maxAutoQueuePerReplan` is higher (or an ops override requests more).
2. **Arena roster** — replan spawn uses the **lean** engineer peer roster only. At or above $1, replan arms the usual `vision_replan` spawn pair (`proposer`, `engineer`).

Meta-tournament arming still uses the separate **$2** lean gate (`LEAN_ROSTER_AVAILABLE_MICROS`, AG-012).

Replan maintainer events and audits include `leanReplan`, `maxAutoQueue`, and `availableMicros` for Mission Control / Activity honesty.

## Code

- `packages/db/src/maintainer.ts` — `REPLAN_LEAN_BUDGET_MICROS`, `maxAutoQueueForReplan`, `rosterKeysForAvailableBudget`, `runVisionReplan`
- `packages/db/src/maintainer.test.ts` — pure policy unit tests
