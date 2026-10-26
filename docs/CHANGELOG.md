# Changelog

## [Unreleased]

### Added
- AG-012: Implement lean roster spawning capability with micros under $2 for Engineer and Reviewer roles only.
- Enforced no full arena spawn under tight budget (< $8 monthly).
- Added `arena.SpawnRoster` function with budget and role constraints.
- Added tests covering role authorization, budget constraints, and roster type selection.
