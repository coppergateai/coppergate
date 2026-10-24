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

## Tests
- `@coppergate/agents` — path/tool gates, abort, failover, prompt-guard, buildPrompt, duplicate FILE, JSON retry
- `delivery.test.ts` — fake idempotency, list fail-closed, 422 recovery, CAS conflict
- `delivery-artifacts.test.ts` — checkpoint build/parse + legacy fail-closed
- `runs.reaper-policy.test.ts` — reclaim parse + WAITING_CI timeout env
- `ci-evidence.test.ts` — WAITING_CI status alone not accept-ready (needs `DATABASE_URL`)
- `budgets.test.ts` — llm_tokens once-per-runId (needs `DATABASE_URL`)
- DB claim/execute suites need `DATABASE_URL`

## Remaining risks
- Agent planning itself remains single-shot (no mid-LLM step checkpoints)
- Concurrent editor sessions have overwritten reliability files mid-work — prefer committing these paths promptly
- Failover doubles spend only on thrown provider failures; operators should size fallback model cost intentionally
- Prompt isolation is defense-in-depth, not a guarantee against model compliance failures
- llm_tokens dedupe is application-level (race of two concurrent inserts for same runId still possible without a unique index)
