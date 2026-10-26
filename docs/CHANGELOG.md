# Changelog

## [Unreleased]

### Added

- AG-012: Introduced lean roster allocation mode in arena package.
  - When availableMicros budget is under $2 and user role is Engineer or Reviewer only,
    the arena uses lean roster mode to reduce memory usage.
  - FULL_ARENA spawn is avoided under tight budget ($8 monthly envelope).
  - This improves memory efficiency and matches architecture acceptance criteria.
