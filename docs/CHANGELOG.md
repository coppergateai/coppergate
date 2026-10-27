# Changelog

## [Unreleased]

### Features

- AG-013: Cursor harness as default coding path honesty — worker prefers workspace Cursor BYOK over env LLM, emits `coding_path_honesty` run progress (including `native_openai` demotion reason), and Arena contender rows surface the hint while runs are live. See `docs/HARNESS.md`.
- P-101: Mission Control crisis clarity (concurrency + provider quota lead attention, muted arena noise, honest empty states). See `docs/mission-control-crisis.md`.
- P-102: Arena Pause drain copy, Live/Paused/Stopped labeling, Resume vs Start controls, and quiet idle/CI/review counts while paused (not ops fires). See `docs/arena-pause-drain.md`.
- AG-012: Implement lean roster spawning under $2 monthly budget for Engineer and Reviewer roles only.
  - Prevent FULL_ARENA spawn under tight budget.
  - Enforce $8 monthly budget envelope.
  - Added concurrency-safe RosterManager.
  - Added tests covering budget and role restrictions.
