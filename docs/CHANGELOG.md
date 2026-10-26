# Changelog

## [Unreleased]

### Features

- AG-012: Implement lean roster mode in arena package.
  - When availableMicros budget is under 2ms and monthly envelope is $8 or less,
    only Engineer and Reviewer roles can spawn.
  - FULL_ARENA spawn is disabled under this tight budget to reduce resource usage.
  - Matches architecture acceptance criteria from coppergate-architecture/docs/OPEN_PROGRAM.md.
