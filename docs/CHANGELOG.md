# Changelog

## [Unreleased]

### Added
- AG-012: Implemented lean roster spawning under tight budget conditions ($8 monthly envelope).
  - Only micros with cost under $2 and roles Engineer or Reviewer are included.
  - Full arena spawn micros are excluded in lean roster mode.
  - Default to full arena spawn if budget is above threshold or no lean roster micros available.
