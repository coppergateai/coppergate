# Changelog

## [Unreleased]

### Added
- AG-012: Implement lean roster spawning under tight budget conditions.
  - Spawn lean roster when available micros are under $2 (200 cents) and role is engineer or reviewer only.
  - Disallow full arena spawn under $8 (800 cents) monthly budget envelope.
  - Added tests covering lean and full roster spawning logic.
