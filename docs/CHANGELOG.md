# Changelog

## [Unreleased]

### Added
- AG-012: Implemented lean roster spawning under budget constraints.
  - Engineers and reviewers only, no full arena spawn if budget is under $2 per micro.
  - SpawnRoster API added with budget-aware roster creation.
  - RosterManager concurrency-safe roster management.
