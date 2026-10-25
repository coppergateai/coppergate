# Changelog

## [Unreleased]

### Added
- AG-010: Implemented quota fail-closed behavior in Arena and Mission Control.
  - Arena pauses processing on `insufficient_quota` error.
  - Mission Control signals pause on quota exhaustion or 429 responses to prevent retry storms.
  - Added tests covering quota consumption, pause signaling, and 429 handling.
