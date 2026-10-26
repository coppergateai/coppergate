# Agent reliability improvement log

Date: 2026-10-24

## Cycle 1
- Lease heartbeat + LLM AbortSignal/timeout/retries
- VALIDATING reaper fail-closed
- Http sandbox fail-closed (`sandbox_required`)
- Delivery outer catch (`delivery_error`)
- Path escape + allowlist enforcement

## Cycle 2
- Poison reclaim limits (`reclaim:N` → `lease_expired_poison`, 45m wall-clock)
- Soft cancel → run `CANCELLED` via `markRunCancelled`
- Arena-aware `retryFailedTask` via `enqueueQueuedTask`

## Cycle 3
- Task/run `WAITING_CI` for live http after PR open; promote to `REVIEW_REQUIRED` on CI acceptReady
- Accept still only from `REVIEW_REQUIRED` (never from WAITING_CI)
- GitHub delivery: fail-closed list-PR errors; recover createPr 422 via re-find
- Refresh CI poll includes WAITING_CI tasks
- Tournament terminal statuses include WAITING_CI

## Cycle 4
- **putFile CAS**: refuse writes when branch tip ≠ expected head (`conflict` / `branch head moved`); surface GitHub 409 as conflict
- **toolAllowlist enforcement**: `isEditToolAllowed` gates FILE writes on run `toolAllowlist` + profile tools (read-only allowlists refuse edits)
- Restored cycle 2/3 DB/worker pieces after concurrent overwrite

## Cycle 5
- **Provider failover**: `FailoverCodingAgent` retries once on a distinct secondary provider after thrown primary failures (exhausted 429/5xx/network)
- Wired via `createCodingAgent` + `LLM_FALLBACK_API_KEY` / `LLM_FALLBACK_BASE_URL` / `LLM_FALLBACK_MODEL` (and options.fallback)
- Native OpenAI harness uses `createCodingAgent` so BYOK path inherits env fallback
- No failover on policy yields (`no_file_blocks`, path gates, spend_cap, cancel/abort) — correctness preserved

## Cycle 14
- **Cursor local SDK adapter**: `CursorSdkCodingAgent` (`@cursor/sdk`, `local.cwd` = sandbox workdir); BYOK vendor `cursor` + per-profile routing
- **Quota failover**: `FailoverCodingAgent` also switches on primary `provider_quota` error events (not only throws); OpenAI primary + Cursor BYOK/`CURSOR_API_KEY` secondary
- Arena `pauseArenaForProviderQuota` only when the run ends without completion (both providers failed); successful Cursor fallback keeps the arena running
- Capability matrix: `cursor_local` live; `cursor_cloud` remains wait-state

## Cycle 6
- **Restored poison reclaim** (was missing on disk): RUNNING → `QUEUED` with `reclaim:N`; after max 3 or 45m wall-clock → `FAILED` (`lease_expired_poison`)
- **WAITING_CI stall timeout**: `finished_at` older than 6h (env `WAITING_CI_TIMEOUT_MS`) → `FAILED` (`waiting_ci_timeout`); frees concurrency slots
- Hard cancel for `WAITING_CI` (no worker lease) → immediate `CANCELLED`
- Worker reaper fails matching tasks for all `failedRuns` (poison / validating / waiting_ci)

## Cycle 7
- **Delivery checkpoint**: persist `delivery_checkpoint` immediately after PR open; skip re-deliver on resume
- **Early finalize**: `markRunWaitingCi` / `markRunAwaitingReview` right after checkpoint (leave VALIDATING before artifacts/notifications)
- **Reaper recovery**: expired VALIDATING with checkpoint → `recoverDeliveredRun` (not `validating_lease_expired`); worker aligns task status
- Legacy `delivery_report` parse fail-closes to `awaitLiveCi: true` (never open Accept early)

## Cycle 8
- **WAITING_CI accept fail-closed**: `getRunCiFitness` treats run status `WAITING_CI` as never `acceptReady` (even if `fitness:pending` event missing after crash)
- `markRunWaitingCi` / `recoverDeliveredRun` write `fitness:pending` with the status transition
- `decideTaskReview(accept)` rejects latest run still `WAITING_CI` and requires `acceptReady`
- **Prompt isolation**: untrusted goal/scope/context wrapped in `<UNTRUSTED_DATA>`; size budgets; injection-phrase flag; system rules ignore data-plane directives

## Cycle 9
- **Malformed LLM JSON**: chat completion body parse failures retry with backoff (same bound as 429/5xx)
- **Duplicate FILE paths**: fail closed (`duplicate_file_path`) — refuse ambiguous last-write-wins completions
- **Usage idempotency**: `appendUsageEvent(llm_tokens)` returns existing row for the same `runId` (no double-bill on resume)

## Cycle 10
- **WAITING_CI promote**: `ciSatisfied` (!blocking && passed) drives `WAITING_CI → REVIEW_REQUIRED`; `acceptReady` stays false until promoted (fixes dead promote path after Cycle 8)
- **Vacuous no-CI**: CI refresh ingests synthetic `no_required_checks` after 5m grace when GitHub returns empty check-runs/statuses — frees slots + unblocks auto-accept on repos without CI
- **Concurrency bump**: Community/Pro `maxConcurrentRuns` 12 → 20

## Cycle 11
- **Auto-merge backoff**: skip already-merged / blocked / terminal PRs; 30m cooldown on “not mergeable” so maintainer ticks stop flooding Activity
- **Activity merge storms**: bucket `merge.attempt` per project (interleaved-safe) with honest outcomes (merged / not ready)
- **Mission Control strip**: show Arena running + awaiting CI (not raw inflight) so it matches Arena spectacle
- **Activity “agents hot”**: count running/awaiting-CI contenders, not the full ACTIVE roster
- **Delivery lease cap**: stop heartbeat before GitHub delivery; renew once (≥5m) so hung http cannot pin VALIDATING forever
- **VALIDATING stuck**: null-lease VALIDATING fails after 15m (`VALIDATING_STUCK_MS`) instead of the 45m RUNNING wall
- **Evidence banner**: pending hard gates / VALIDATING no longer mislabeled as “CI checks failed”
- **Activity project tags**: resolve projectName from `targetType=project` and include `projectId` on replan audits

## Cycle 12
- **Quiet reaper failures**: `waiting_ci_timeout` / `validating_lease_expired` / `lease_expired_poison` no longer inflate Arena Needs attention
- **Roster strip**: Arena snapshot excludes ELIMINATED contenders (was showing 1000+ “idle” after spawn cycles)
- **Activity**: collapse `fitness.score` storms like debit/eliminate

## Cycle 13
- **Architecture ID dedupe**: replan + community scout exclude in-flight Open IDs (open tasks + open Coppergate PRs)
- **Auto-accept WAITING_CI tasks**: sync task → REVIEW_REQUIRED when run is accept-ready
- **Per-project concurrency**: Community/Pro `maxConcurrentRunsPerProject: 3`
- **Terminal task skip**: no VALIDATING/WAITING_CI transitions when task already FAILED/CANCELLED/DONE
- **Release already_exists**: 422 tag collision treated as success

## Cycle 14
- **Pause quiet**: VALIDATING/WAITING_CI while arena paused/stopped no longer Needs attention
- **Grammar**: “1 agent needs attention”
- **Replan attention**: collapse per project; surface error + project name
- **Evidence attention**: title includes project so duplicate P-00N rows are distinguishable
- **Issues API**: GitHub 403/404 no longer 500 the project Overview issues panel

## Cycle 15
- **Soft-cancel reaper**: lease-expired / stuck `RUNNING|VALIDATING` with `cancel_requested_at` → hard `CANCELLED` + estimate release (no requeue / recover / immortal inflight)
- **Lease renew refuse**: `renewRunLease` fails with `cancelled` when soft-cancel is set so ownership dies at the lease boundary
- **Pre-delivery cancel**: worker honors cancel after agent work and immediately before PR deliver / review POST (no ship-after-cancel)
- **CI required fail-closed**: when `CI_REQUIRED_CHECK_NAMES` is set, helper greens alone do not satisfy / auto-accept while the required context is still missing (`scoreCiChecks`)

## Tests
- `@coppergate/agents` — path/tool gates, abort, failover, prompt-guard, buildPrompt, duplicate FILE, JSON retry
- `delivery.test.ts` — fake idempotency, list fail-closed, 422 recovery, CAS conflict
- `delivery-artifacts.test.ts` — checkpoint build/parse + legacy fail-closed
- `runs.reaper-policy.test.ts` — reclaim parse + WAITING_CI timeout env
- `runs.claim.test.ts` — soft-cancel reaper → CANCELLED (needs `DATABASE_URL`)
- `ci-evidence.score.test.ts` — required-missing helpers ≠ accept-ready
- `ci-evidence.test.ts` — WAITING_CI status alone not accept-ready (needs `DATABASE_URL`)
- `budgets.test.ts` — llm_tokens once-per-runId (needs `DATABASE_URL`)
- DB claim/execute suites need `DATABASE_URL`

## Remaining risks
- Agent planning itself remains single-shot (no mid-LLM step checkpoints)
- Concurrent editor sessions have overwritten reliability files mid-work — prefer committing these paths promptly
- Failover doubles spend only on thrown provider failures; operators should size fallback model cost intentionally
- Prompt isolation is defense-in-depth, not a guarantee against model compliance failures
- llm_tokens dedupe is application-level (race of two concurrent inserts for same runId still possible without a unique index)
- Delivery still uses a single capped lease renew (multi-file slow GitHub can race reaper before checkpoint)
- PR-review path has no durable checkpoint — crash after GitHub POST can FAIL a landed review
