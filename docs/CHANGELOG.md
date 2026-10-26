# Changelog

## [Unreleased]

### Added

- AG-012: Implemented lean roster allocation under tight budget constraints.
  - When availableMicros < $2, only Engineer and Reviewer roles are allowed.
  - FULL_ARENA spawn is disabled under this budget.
  - This reduces memory usage and keeps within the $8 monthly envelope.
