# Changelog

## [Unreleased]

### Added
- AG-012: Implement lean roster allocation in arena package.
  - When availableMicros < $2 and role is Engineer or Reviewer only, arena uses lean roster allocation.
  - FULL_ARENA spawn is avoided under tight $8 monthly budget.
  - Added tests covering lean roster behavior and budget enforcement.
