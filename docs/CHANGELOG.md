# Changelog

## [Unreleased]

### Added

- AG-012: Introduced lean roster allocation mode in arena package.
  - Restricts allocation to Engineer and Reviewer roles only under $2 monthly budget.
  - Disables FULL_ARENA spawn under tight budget constraints.
  - Enforces max 1MB allocation size to keep memory footprint lean.
  - Provides `Arena` struct with `LeanRosterMode` and role-based allocation control.
  - Includes tests validating budget and role restrictions.
