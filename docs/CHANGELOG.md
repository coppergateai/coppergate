# Changelog

## [Unreleased]

### Fixes

- GitHub PR delivery batches all files into a single Git Data API commit (no more N Contents-API commits with the same message).
- Peer-only arena contenders: tournaments are same-role strategy peers (no Fixer×QA / Engineer×Reviewer duels). Spawn matrix picks primary role; meta-tournament flips strategy on the champion key; sticky cross-role pools cleared on spawn/fan-out.

### Features

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
