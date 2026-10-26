# Changelog

## [Unreleased]

### Added
- AG-012: Implement lean roster allocation under $2 monthly budget.
  - Arena selects LEAN_ROSTER mode when availableMicros ≤ $2 (2,000,000 micros).
  - FULL_ARENA spawn disallowed under tight budget.
  - Added budget-aware roster management with entry cost accounting.
  - Added tests covering arena type selection, budget enforcement, and roster entry management.
