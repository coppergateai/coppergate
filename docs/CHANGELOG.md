# Changelog

## [Unreleased]

### Added
- AG-012: Implemented lean roster spawning under tight budget constraints.
  - Spawn lean roster only when available micros are under $2 each.
  - No full arena spawn allowed if monthly budget is below $8.
  - Requires at least one engineer and one reviewer to spawn lean roster.
  - Added tests covering budget and staff constraints.
