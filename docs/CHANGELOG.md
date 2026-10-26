# Changelog

## [Unreleased]

### Added
- AG-012: Implemented lean roster arena allocation for micros under $2 monthly spend.
  - Uses LEAN_ROSTER arena type for engineer+reviewer only allocations under budget.
  - Prevents spawning FULL_ARENA under tight budget envelope.
  - Added tests covering budget and arena type selection logic.
