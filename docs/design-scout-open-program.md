# Design scout → Open Program rows (AG-040)

Continuous maintainer path: Playwright captures project routes, flags layout overflow, and appends **Open** rows on the bound architecture markdown (same invent path as AG-037 bug scout).

## When it runs

- L2 maintainer tick, policy **`designScout: true`** (opt-in; default off).
- Interval / caps: `designScoutIntervalHours` (24), `designScoutMaxPerRun` (2).
- Requires budget + primary repo (for optional screenshots / GH issues).
- Open Program append requires bind (`architectureRepo` + `architecturePaths`).

## Detection

Metric-driven (not LLM vibes):

- Horizontal scroll (`hScroll` / `scrollW > client`)
- Elements overflowing the right edge

Routes: landing, pricing, docs, login (+ authenticated Mission Control / Agents / Skills / Tools when `DESIGN_SCOUT_STORAGE_STATE` is set).

## Write path

1. Capture shots via Playwright.
2. `proposeDesignOpenRows` → next `P-N`, section `## Design scout (continuous)`, fingerprint `<!-- design-scout:fp=path_… -->`.
3. Default-branch Contents append (same gate as Done writeback).
4. Optionally still open GitHub `design`/`ux` issues (legacy) + auto-import when configured.

Vision replan spends new Open IDs like any other program line.

## Settings

Configuration → Autonomous maintainer → Policy → **Design scout → screens + Open Program rows (AG-040)**.
