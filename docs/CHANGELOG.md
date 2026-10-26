# Changelog

## [Unreleased]

### Added
- AG-012: Implemented lean Arena allocator with tight budget enforcement.
  - Allocations fail with ErrFullArena when capacity exceeded.
  - Designed for micros under $2 engineer+reviewer cost, no full arena spawn beyond budget.
  - Includes Reset method for reuse.
  - Covered by unit tests.
