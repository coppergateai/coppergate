# Changelog

## [Unreleased]

### Added
- AG-012: Implemented lean roster arena allocator with micros under $2 monthly budget.
  - Avoids spawning full arenas under tight budget constraints.
  - Provides AllocMicro for small allocations with budget tracking.
  - Suitable for engineer+reviewer workloads under $8 monthly envelope.
