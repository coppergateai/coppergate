# Changelog

## [Unreleased]

### Added
- AG-012: Implement lean roster allocation under tight budget.
  - When availableMicros budget is under $2, only Engineer and Reviewer roles are allowed.
  - FULL_ARENA spawn is disallowed under this budget to keep memory usage lean.
