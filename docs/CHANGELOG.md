# Changelog

## [Unreleased]

### Features

- P-101: Mission Control crisis clarity (concurrency + provider quota lead attention, muted arena noise, honest empty states). See `docs/mission-control-crisis.md`.
- AG-012: Implement lean roster spawning under $2 monthly budget for Engineer and Reviewer roles only.
  - Prevent FULL_ARENA spawn under tight budget.
  - Enforce $8 monthly budget envelope.
  - Added concurrency-safe RosterManager.
  - Added tests covering budget and role restrictions.
