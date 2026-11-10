# Bug scout → Open Program rows (AG-037)

Continuous maintainer tick path that turns **FAILED run / tip CI evidence** into new **Open** rows on the bound architecture markdown.

## When it runs

- Project autonomy **L2**, maintainer tick (~60s), policy **`bugScout: true`** (opt-in; default off).
- Interval: `bugScoutIntervalHours` (default 12).
- Caps: `bugScoutMaxPerRun` (default 2), lookback `bugScoutLookbackHours` (default 48).
- Requires Open Program bind (`architectureRepo` + `architecturePaths`) and non-paused budget.

## Sources

1. Recent **FAILED** `agent_runs` for the project (`errorCode`, `errorMessage`, task title, headSha).
2. Soft: primary repo **default-branch tip** check evidence via GitHub API (failed / timed_out), with **check-run annotation** snippets when available (CI log scan fallback to check name + SHA).

## Noise (never become Open rows)

Heal loops already own these — scout skips them:

- Error codes: `waiting_ci_timeout`, `merge_conflict`, `stale_delivery`, `cancelled`, `lease_reclaimed`, `insufficient_quota`, `pr_closed`, `validating_lease_expired`
- Titles matching `[ship-gate]`, `merge_conflict`, `stale_delivery`

## Write path

1. Cluster evidence by fingerprint (`errorCode` + normalized message).
2. Dedup against existing `<!-- bug-scout:fp=… -->` comments and overlapping Open/Done titles.
3. Allocate next `AG-N` via `nextArchitectureId`.
4. Append under `## Bug scout (continuous)` with `| Open | ID | Title | Notes |`.
5. Default-branch Contents API update (same trust model as Done writeback; `allowDefaultBranchWrite`).
6. Record `maintainer_events.kind = bug_scout`.

Vision replan then spends new Open IDs like any other program line.

## Settings

Maintainer panel → Policy: **Bug scout** checkbox + interval/max/lookback display. API `action: update` accepts `policy.bugScout` (+ interval/max/lookback).

## Explicitly not

- Playwright / design scout
- Sentry webhook invent (signal path)
- Freestyle invent from PRODUCT.md
- Architecture PR review gate (direct append when enabled)
