# Changelog

## [Unreleased]

### Added

- AG-012: Implemented Lean Roster capability in arena package.
  - Supports micros with roles Engineer and Reviewer only.
  - Enforces per-micro cost limit of $2.
  - Enforces monthly budget envelope of $8.
  - Prevents spawning FULL_ARENA micros under tight budget.
  - Includes thread-safe management and validation.
  - Covered by unit tests.
