# Changelog

## [Unreleased]

### Features

- AG-012: Implement lean roster spawning under tight budget constraints.
  - Spawn lean roster when micros cost under $2 and only engineer+reviewer roles are allowed.
  - Prevent full arena spawn if monthly budget is under $8.
  - Added concurrency-safe RosterManager for roster lifecycle management.
  - Includes tests covering budget and micro cost conditions.
