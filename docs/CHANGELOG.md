# Changelog

## [Unreleased]

### Features

- P-140: Workspace Arena board shows efficiency payoff (f, spend, e = f/spend^α), CI-fail zeroing, and winner promote reason on expanded lanes.
- P-101: Mission Control crisis clarity (concurrency + provider quota lead attention, muted arena noise, honest empty states). See `docs/mission-control-crisis.md`.
- P-102: Arena Pause drain copy, Live/Paused/Stopped labeling, Resume vs Start controls, and quiet idle/CI/review counts while paused (not ops fires). See `docs/arena-pause-drain.md`.
- AG-012: Implement lean roster spawning under $2 monthly budget for Engineer and Reviewer roles only.
  - Prevent FULL_ARENA spawn under tight budget.
  - Enforce $8 monthly budget envelope.
  - Added concurrency-safe RosterManager.
  - Added tests covering budget and role restrictions.
