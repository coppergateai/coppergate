# Changelog

## [Unreleased]

### Features

- AG-012: Implement lean roster allocation under tight budget constraints.
  - When availableMicros budget is under $2 (2000 microseconds), full arena spawn is disallowed.
  - Lean roster spawn allowed only if roster contains at least one engineer and one reviewer.
  - Added new Arena and Roster APIs to support budget-aware spawning.
  - Includes tests covering lean roster and full arena spawn logic.
