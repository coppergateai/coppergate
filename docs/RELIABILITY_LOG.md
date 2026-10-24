# Agent reliability improvement log

Date: 2026-10-24

## Discoveries (priority)

| Priority | Issue | Impact |
|----------|--------|--------|
| P0 | Lease not renewed during long LLM calls (30s default) | Dual-worker duplicate execution / branch races |
| P0 | `VALIDATING` runs not reaped on worker death | Permanently stuck runs + concurrency holds |
| P1 | Sandbox create failure continued with fake validation on http | False “validated” PRs |
| P1 | Delivery errors after `markRunValidating` not fail-closed | Stuck VALIDATING mid-flight |
| P1 | No LLM AbortSignal / timeout; cancel ignored mid-fetch | Hung workers; delayed cancel |
| P1 | `allowedPaths` not enforced on FILE writes | Out-of-scope / path-escape edits |
| P2 | Reaper requeue ignores poison / maxAttempts | Infinite reclaim loops |
| P2 | Soft cancel marks run `FAILED` not `CANCELLED` | Status model inconsistency |
| P2 | No coding-agent provider failover | Transient outages fail whole run |

## Implemented this cycle

1. **Lease heartbeat** in `executeClaimedRun` (~`leaseMs/3`) + abort on `not_owner`.
2. **LLM AbortSignal + timeout** (default 120s) + bounded 429/5xx retries in `OpenAiCompatibleCodingAgent`.
3. **`reapStaleRuns`**: expired VALIDATING → `FAILED` (`validating_lease_expired`) + estimate release; worker fails matching task.
4. **Http sandbox fail-closed** (`sandbox_required`) when sandbox create fails.
5. **Delivery path outer catch** → `delivery_error` + task FAILED (no silent VALIDATING stick).
6. **Path policy**: escape + allowlist enforcement (`path_escape` / `path_not_allowed`).
7. **Ops runbook** updated for heartbeat / VALIDATING reaper / backoff.

## Tests

- `packages/db/src/runs.claim.test.ts` — stale VALIDATING fails closed
- `packages/agents/src/path-policy.test.ts` — path safety / allowlist
- `packages/agents/src/openai-compatible.test.ts` — path escape, allowlist, abort mid-flight

## Remaining risks (not fixed this cycle)

- No durable checkpoint/resume of agent progress (reclaim still cold-starts).
- Reaper reclaim of RUNNING still does not burn `maxAttempts` (poison loop).
- Soft cancel still ends runs as `FAILED`/`cancelled` rather than `CANCELLED`.
- `WAITING_CI` status referenced but never written.
- Live GitHub delivery race under dual writers (mitigated by heartbeat, not fully eliminated).
- `toolAllowlist` still advisory (no multi-turn tool router yet).

## Evidence policy

Do not claim production reliability wins until claim/execute tests pass against a live `DATABASE_URL` and agent unit tests are green in CI.
