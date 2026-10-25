# Changelog

## [Unreleased]

### Added

- AG-011: Implemented lease honesty under Pause state with quiet mid-flight CI behavior.
- Lease renewals while paused do not cause noisy errors and keep lease expiry honest.
- Fail-closed delivery behavior preserved on lease expiry.
