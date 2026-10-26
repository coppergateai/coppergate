# Changelog

## [Unreleased]

### Added

- AG-012: Implemented LeanArena in arena package for lean roster allocation under $2 monthly budget.
  - Only Engineer and Reviewer roles allowed.
  - Avoids FULL_ARENA spawn under tight budget.
  - Includes allocation, free, and role restriction logic.
  - Added tests covering allocation, role restrictions, and budget enforcement.
