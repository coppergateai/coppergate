# Provider failover spend (AG-016)

When `FailoverCodingAgent` switches from a primary coding provider to a fallback, **both** legs can incur LLM cost. Coppergate debits them as separate `usage_events` rows and surfaces which model paid in Activity and the run inspector.

## Ledger

| `usage_events.meta.providerRole` | Meaning |
| --- | --- |
| `primary` | Spend on the first provider (including partial work before quota/throw failover) |
| `fallback` | Spend on the secondary provider after `provider_failover` |

Idempotency:

- **Legacy** rows (no `providerRole`) — still one `llm_tokens` row per `runId` (resume/retry safe).
- **AG-016** — up to one primary and one fallback row per `runId`; retries dedupe per role, not across roles.

Run `actualCostMicros` is the **sum** of primary + fallback for that execution.

## UX

- **Activity** — audit action `run.llm_debit` with `providerRole`, `provider`, `model`, and `costMicros`.
- **Run timeline** — progress event `provider_spend_debited` with the same fields (inspector + run message helpers).

## Validation

- `packages/db/src/provider-failover-spend.test.ts` — ledger math (no double-replace on completion).
- `packages/db/src/llm-usage-meta.test.ts` — meta/idempotency roles.
- `packages/db/src/budgets.test.ts` — distinct primary/fallback debits + per-role dedupe (needs `DATABASE_URL`).
- `apps/web/src/app/workspaces/[id]/activity/events.test.ts` — Activity summaries.
