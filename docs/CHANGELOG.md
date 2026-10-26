# Changelog

## [Unreleased]

### Added
- AG-012: Implement lean roster management supporting only Engineer and Reviewer roles.
  - Enforces $8 monthly micros envelope.
  - Each user costs 2 micros.
  - Prevents FULL_ARENA spawn under tight budget.
  - Provides thread-safe AddUser, RemoveUser, and Users listing.
  - Includes tests covering budget enforcement and role filtering.
