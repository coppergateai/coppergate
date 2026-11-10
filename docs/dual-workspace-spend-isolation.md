# Dual-workspace spend isolation (AG-024)

Sole-dev dogfood runs **two workspaces** on one stack — e.g. Coppergate self-pilot (`$8` monthly envelope) and kprompt (`$100` pooled envelope). Each workspace owns a separate budget row and ledger slice; they must **never share debit**.

## Invariant

Every spend ledger write — especially `estimate_reserve` on queue and arena fan-out — must:

1. Include a non-empty `workspaceId`.
2. Match the project’s `projects.workspace_id`.
3. When a `taskId` is present, match the task’s workspace and project.

Violations fail closed with `BudgetError` code `mismatch` before any row is inserted.

## Implementation

- `packages/db/src/budgets.ts` — `assertUsageEventWorkspaceScope` on `appendUsageEvent`, `reserveEstimateForTask`, and estimate release helpers.
- Dogfood ops (`scripts/dogfood-coppergate-boot.mjs`, `packages/db/scripts/ops-stabilize-dogfood.ts`) pause kprompt Arena so only one pilot burns BYOK at a time; ledger scoping is the data-plane backstop.

## Regression

- `packages/db/src/dual-workspace-spend.test.ts` — two workspaces, reserve in one does not reduce the other; cross-tenant reserve/append rejected.
- `scripts/assert-ag024-dual-workspace-spend.mjs` — static fail-closed check that reserve paths assert workspace scope.

## User-visible behavior

Mis-scoped API calls (wrong `workspaceId` for a project) return **400** with a clear message instead of silently debiting the wrong envelope.
