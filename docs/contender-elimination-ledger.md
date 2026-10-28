# Contender elimination ledger (P-141)

Survivor selection debits **loser** contender purses after tournament resolve. Eliminations are audit-backed — not hidden ops failures.

## Ledger

| Audit action | Meaning |
| --- | --- |
| `contender.debit` | Loser loss applied; budget may remain |
| `contender.eliminated` | Debit drove budget to zero — contender leaves the active pool |

Meta includes `profileKey`, `arenaId`, `debitMicros`, and `remainingMicros` for Activity summaries and the Agent inspector **Budget ledger**.

API: `GET /api/workspaces/:id/contenders/:contenderId/ledger`

DB: `listContenderBudgetLedger` in `@coppergate/db`.

## Arena UX

Workspace Arena snapshot lanes expose:

- **Live roster** — ACTIVE contenders only (attention strip unchanged).
- **Show N eliminated** — collapsed list with **Eliminated** label; opens inspector + ledger.
- **Pool caption** — e.g. `2 with budget · 3 eliminated` so duel starvation is visible without inflating idle counts.

## Fan-out honesty

`tournament.fanout` audit meta records `requestedFanout`, `eligibleCount`, `eliminatedInPool`, and `poolStarved` / `poolStarvedReason` when width drops below requested N (contenders, concurrency, or workspace budget).

Activity summaries explain reduced N in plain language.

## Validation

- `packages/db/src/contender-elimination.test.ts` — pool summary + fan-out honesty (pure).
- `packages/db/src/arena.elimination.test.ts` — loser debit → ELIMINATED + ledger row (needs `DATABASE_URL`).
- `apps/web/src/app/workspaces/[id]/activity/events.test.ts` — debit/eliminate/fan-out summaries.

## Change history

- v1.0 (P-141): Ledger API, enriched audit meta, Arena eliminated roster + pool caption, Activity fan-out honesty.
