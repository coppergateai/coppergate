# Multi-project maintainer rollup (P-145)

MAINTAINER §7 — one workspace, many maintainer-enabled projects: roll up **envelope burn**, **verified GitHub merges**, and **human PR touches** without double-counting pooled spend.

## API

`GET /api/workspaces/[id]/maintainer?days=30` (workspace owner)

Returns `WorkspaceMaintainerRollup`:

- **workspace** — pooled envelope spend, cap, and burn ratio (0–1).
- **projects** — per-project metrics (`projectName`, project spend, verified merges, human touches).
- **totals** — sums merges and verified merges across projects; **spend and burn use the workspace envelope once** (not N× pooled spend).
- **zeroTouchDelivery** — `true` when `verifiedMerges > 0` and `humanTouches === 0` in the window (autonomous path proof).

## Verified merge

A maintainer `auto_merge` event with `merged: true` in the rollup window (GitHub merge succeeded after auto-accept).

## Dogfood proof

```bash
DATABASE_URL=… pnpm --filter @coppergate/db exec node --import tsx \
  ../../scripts/dogfood-prove-workspace-maintainer-rollup.mjs
```

Exit `0` when rollup shows zero-touch delivery or your `--min-verified-merges` threshold is met.

## Version

- v1.0 (P-145): Workspace rollup API, burn + verified merges + zero-touch totals, Projects home badges.
