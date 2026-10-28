# Changelog

## [Unreleased]

### Fixes

- Peer-only arena contenders: tournaments are same-role strategy peers (no Fixer×QA / Engineer×Reviewer duels). Spawn matrix picks primary role; meta-tournament flips strategy on the champion key; sticky cross-role pools cleared on spawn/fan-out.

### Features

- AG-013: Cursor harness as default coding path honesty — worker prefers workspace Cursor BYOK over env LLM, emits `coding_path_honesty` run progress (including `native_openai` demotion reason), and Arena contender rows surface the hint while runs are live. See `docs/HARNESS.md`.
- P-101: Mission Control crisis clarity (concurrency + provider quota lead attention, muted arena noise, honest empty states). See `docs/mission-control-crisis.md`.
- P-102: Arena Pause drain copy, Live/Paused/Stopped labeling, Resume vs Start controls, and quiet idle/CI/review counts while paused (not ops fires). See `docs/arena-pause-drain.md`.
- P-141: Contender elimination ledger (audit-backed debits), Arena **Eliminated** roster + pool honesty, and Activity fan-out starvation summaries. See `docs/contender-elimination-ledger.md`.
- P-143: L2 auto-merge + min_human **Settings honesty** — effective merge/min_human copy, maintainer ON ≠ prod deploy, kill-switch + envelope fail-closed reminders; arena ensure defaults min_human on. See `docs/project-settings-honesty.md`.
- P-144: **L3 Release Assistant** — maintainer policy `autoRelease` off by default; when enabled, tick ships GitHub tag + Release with notes, `maintainer.release` + `release` maintainer event audit (`prodDeploy: false`). See `docs/l3-release-assistant.md`.
- AG-012: Lean meta gate under $2 available micros; arena seating is engineer strategy peers (Reviewer is critic/catalog, not a duel seat).
