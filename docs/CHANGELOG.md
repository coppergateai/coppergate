# Changelog

## [Unreleased]

### Added

- AG-012: Implemented lean roster mode in arena package.
  - Activates when availableMicros budget is under 2ms and monthly budget is $8 or less.
  - Restricts arena spawns to Engineer and Reviewer roles only.
  - Disallows FULL_ARENA spawns under tight budget constraints.
  - Provides API to check lean roster mode and manage spawns accordingly.
  - Includes tests covering mode activation, spawn restrictions, and config updates.
