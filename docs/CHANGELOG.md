# Changelog

## [Unreleased]

### Fixes

- AG-018: Maintainer vision replan re-pins `defaultContenderN` to `maxTournamentN` so spawn/invent cannot drift duel width above policy (N=1 dogfood respected). See `docs/maintainer-contender-pin.md`.
- GitHub PR delivery batches all files into a single Git Data API commit (no more N Contents-API commits with the same message).
- Peer-only arena contenders: tournaments are same-role strategy peers (no Fixer×QA / Engineer×Reviewer duels). Spawn matrix picks primary role; meta-tournament flips strategy on the champion key; sticky cross-role pools cleared on spawn/fan-out.

### Features

- AG-036: Behind delivery auto-update — accept-ready + strict-behind PRs get GitHub `update-branch` (board drain + auto-merge path); update conflict arms `merge_conflict`; Arena labels REVIEW as Awaiting merge. See `docs/behind-delivery-update.md`.
- AG-021: Flake cooldown wire — `detectFlakePattern` gates `ci_failure` auto-arm, Evidence Retry, and worker execute so oscillating checks do not thrash spend. See `docs/flake-cooldown.md`.
- AG-020: Architecture fetch fail-closed — bad token / 404 Open Program markdown skips invent with `architecture_fetch_failed` and a Mission Control tip to re-bind Settings. See `docs/architecture-fetch-fail-closed.md`.
- AG-014: Mid-run file-write checkpoint — after each sandbox write, persist `file_write_checkpoint`; on reclaim restore bodies and skip identical OpenAI-compatible rewrites. See `docs/file-write-checkpoint.md`.
- AG-035: Unattended board drain — retire obsolete `[ship-gate]` when tip is green / PR closed; dirty delivery PRs get `merge_conflict` after ~15m (no 6h wait) and free parent concurrency; signal arm survives min_human/approve races. See `docs/ship-receipts/AG-035.md`.
- SEC-036: **Prod / default-branch write policy gate** — refuse merge-to-default, GitHub Release, default-branch Contents writes, and sandbox production deploy commands unless explicit policy flags (`mergeEnabled`, `autoRelease`, `prodWritesEnabled`). See `docs/prod-write-policy-gate.md`.
- AG-034: Ship-gate heal-only merge — while tip is `default_branch_ci_red`, product auto-merge stays halted but `[ship-gate]` heal PRs still merge (`shipGateMergeMode=heal_only`), closing the AG-031 enqueue→never-merge deadlock. See `docs/ship-gate-self-heal.md`.
- AG-033: `stale_delivery` signal — open (non-dirty) delivery PRs after `waiting_ci_timeout` arm a same-head fixer instead of `NEEDS_REPLAN`; dirty stays AG-032; replan only when no healable PR. See `docs/stale-delivery-heal.md`.
- AG-019: Activity **merge.attempt** noise floor — keeps Cycle 11 per-project bucketing (interleaved-safe); pure “not mergeable” storms collapse to the **latest** outcome instead of “×N not mergeable” spam. Mixed buckets still show honest merged / not-ready counts. See `docs/activity-merge-noise-floor.md`.
- AG-032: `merge_conflict` signal — dirty delivery PRs arm a fixer task to rebase the same head instead of AG-031 `request_changes` → NEEDS_REPLAN. See `docs/merge-conflict-signal.md`.
- AG-031: Ship-gate tip-red self-heal — when auto-merge halts on `default_branch_ci_red`, maintainer enqueues a `[ship-gate]` tip-CI fix task (spend-licensed reliability, not freestyle invent); stale `waiting_ci_timeout` REVIEW no longer freezes continuous backlog. See `docs/ship-gate-self-heal.md`.
- AG-017: WAITING_CI required-check honesty — when `CI_REQUIRED_CHECK_NAMES` never arrive (or flake), Evidence Center and Arena explain required-missing vs flake; reaper timeout messages stay fail-closed (no fake Accept-ready). See `docs/waiting-ci-required-check-honesty.md`.
- AG-015: Mission Control replan skip reasons (`no_architecture_open_id`, `architecture_ids_in_flight`) surface as calm Open Program idle attention — not `replan_failed` ops fire. See `docs/mission-control-crisis.md`.
- P-142: Critic fitness cites evidence refs — non-zero fitness requires cited CI/validation + tests(/coverage/e2e) artifact ids; vibes-only promote blocked (`vibes_only_blocked`). See `docs/critic-fitness-evidence-refs.md`.
- P-140: Arena efficiency payoff UX — board strip + agent cards + inspector show `e · f · spend` (`e=f/spend^α`), CI fail ⇒ e=0 copy, and winner promote reason. See `docs/arena-efficiency-payoff.md`.
- Claude Code (Agent SDK) coding harness — `ClaudeCodeCodingAgent` via `@anthropic-ai/claude-agent-sdk`, BYOK vendor `claude_code`, harness kind `claude_code`, env `ANTHROPIC_API_KEY` / `CLAUDE_CODE_MODEL`. Prefer Cursor when both exist; Claude Code is OpenAI failover when Cursor is absent. See `docs/HARNESS.md`.
- P-150–P-154: Agents → Skills → Tools (MCP) runtime + UX — `ToolRuntime` + Sonar/generic MCP invoke (worker preflight; optional `ACPP_GATEWAY_URL`), `skill_snapshot_json` on runs, Tools page as MCP home (SonarQube + HTTPS MCP), bidirectional skill/tool grants, `SYSTEM_TOOL_CATALOG` single source of truth. Custom tool tokens remain catalog/policy only; Sonar/`mcp:*` are invokable.
- AG-030: Maintainer enable no silent escalation — existing workspace spend cap is never raised on enable; multi-repo, auto-release, and extra signal providers are stripped with audit `escalationClamps`. See `docs/maintainer-enable-no-escalation.md`.
- Catalog CRUD: workspace owners can create/update/delete custom Agents and Skills, reset system overrides, manage Tools (workspace defs + allowlist) and MCP connections from Agents / Skills / Tools pages. Fail-closed allowlists; custom tool tokens are catalog/policy only (harness stays core + MCP).
- AG-013: Cursor harness as default coding path honesty — worker prefers workspace Cursor BYOK over env LLM, emits `coding_path_honesty` run progress (including `native_openai` demotion reason), and Arena contender rows surface the hint while runs are live. See `docs/HARNESS.md`.
- AG-016: Provider failover spend — primary and fallback LLM usage debited as separate ledger rows; Activity `run.llm_debit` and run timeline show which model paid; run cost sums both legs (no completion overwrite). See `docs/provider-failover-spend.md`.
- P-101: Mission Control crisis clarity (concurrency + provider quota lead attention, muted arena noise, honest empty states). See `docs/mission-control-crisis.md`.
- P-102: Arena Pause drain copy, Live/Paused/Stopped labeling, Resume vs Start controls, and quiet idle/CI/review counts while paused (not ops fires). See `docs/arena-pause-drain.md`.
- P-141: Contender elimination ledger (audit-backed debits), Arena **Eliminated** roster + pool honesty, and Activity fan-out starvation summaries. See `docs/contender-elimination-ledger.md`.
- P-143: L2 auto-merge + min_human **Settings honesty** — effective merge/min_human copy, maintainer ON ≠ prod deploy, kill-switch + envelope fail-closed reminders; arena ensure defaults min_human on. See `docs/project-settings-honesty.md`.
- P-144: **L3 Release Assistant** — maintainer policy `autoRelease` off by default; when enabled, tick ships GitHub tag + Release with notes, `maintainer.release` + `release` maintainer event audit (`prodDeploy: false`). See `docs/l3-release-assistant.md`.
- P-145: **Multi-project maintainer rollup** — workspace envelope burn, verified `auto_merge` counts, and zero-touch delivery signal across maintainer-enabled projects without double-counting pooled spend. See `docs/maintainer-multi-project-rollup.md`.
- P-146: **D14 wedge honesty** — locked KPI path Import → Arena → CI → Accept on project Overview; program-bound copy refuses freestyle Arena invent without Open ID; `WAITING_CI` surfaces as an explicit pipeline step. See `docs/issue-wedge-honesty.md`.
- AG-012: Lean meta gate under $2 available micros; arena seating is engineer strategy peers (Reviewer is critic/catalog, not a duel seat).
