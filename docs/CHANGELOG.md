## [Unreleased]

### Added
- AG-012: Implemented lean roster allocation under $2 micros cost per engineer+reviewer pair.
  - Lean roster enabled when cost is under $2 micros and monthly budget is $8.
  - Full arena spawn prevented under tight budget; fallback to lean roster or error if budget exceeded.
  - New `arena.Roster` type with `LeanRoster` and `FullArenaRoster` options.
  - Tests cover budget constraints and roster type selection.
