# Changelog

## [Unreleased]

### Features

- AG-012: Implement lean roster spawning under $2 monthly budget for Engineer and Reviewer roles only.
  - Prevent FULL_ARENA spawn under tight budget.
  - Enforce $8 monthly budget envelope.
  - Added concurrency-safe RosterManager.
  - Added tests covering budget and role restrictions.
