# Docs drift — optional Arena attention (AG-022)

When a delivery touches API-shaped paths without companion docs, Coppergate surfaces **optional** attention — not a Spend License bypass and not an Arena “needs attention” ops fire.

## Heuristic

`detectDocsDrift` in `@coppergate/signals` (`packages/signals/src/hygiene.ts`) flags changes where:

- At least one path matches API / OpenAPI / routes patterns, and
- No path matches docs / README / OpenAPI doc patterns.

## Wiring

1. **Worker** — after `delivery_report` is persisted, emits a `progress` run event with `code: "docs_drift"` when drift is detected.
2. **Arena snapshot** — `listWorkspaceArenaSnapshot` attaches `optionalAttention` on contender runs (from progress events or delivery artifacts) and counts `summary.optionalAttention`.
3. **Mission Control** — normal-priority `docs_drift` attention rows link to Arena; they do not lead crisis sorting.

Spend License is unchanged: docs drift copy is not an Open Program ID and does not authorize reserve/fan-out.

## Tests

- `packages/db/src/docs-drift-attention.test.ts`
- `packages/db/src/run-event-hints.test.ts` (AG-022 awaitingCi line)
- `packages/db/src/spend-license.test.ts` (no bypass)
- `scripts/assert-ag022-docs-drift-wire.mjs`
