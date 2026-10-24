# Coppergate ops runbook (TASK031)

## Worker crash mid-run

1. Leases expire after `leaseMs` (default 30s). Workers renew via heartbeat (~`leaseMs/3`) during agent/validation work.
2. `reapStaleRuns`: expired **RUNNING** → `QUEUED` with `reclaim:N` (max 3) then `FAILED` (`lease_expired_poison`) or wall-clock >45m; expired **VALIDATING** with a `delivery_checkpoint` → recover to `WAITING_CI` / `REVIEW_REQUIRED` (PR already shipped); otherwise → `FAILED` (`validating_lease_expired`); **WAITING_CI** past timeout (default 6h, `WAITING_CI_TIMEOUT_MS`) → `FAILED` (`waiting_ci_timeout`). Worker aligns task status for recoveries and failures.
3. User can **Cancel** then **Retry** from task detail without operator help.
4. Check worker logs for `claimed run` / `run processed` / `lost run lease ownership` / `worker loop iteration failed`.
5. If a run is stuck RUNNING with a fresh lease, cancel it (sets `cancel_requested_at`); the worker cooperatively stops (LLM fetch is also aborted via `AbortSignal`).

## Poison / failing messages

- Validation failures → run `FAILED` + `validation_report` artifact; task `FAILED`; user retries with a new attempt/idempotency key.
- CI failure evidence → `ci_failed` blocks accept; user requests changes or rejects.
- Budget paused / insufficient → enqueue and worker execute fail closed; resume spend in settings.
- LLM provider outages: set `LLM_FALLBACK_API_KEY` (+ optional `LLM_FALLBACK_BASE_URL` / `LLM_FALLBACK_MODEL`) for one automatic failover on thrown 429/5xx/network failures only.
- Accept is blocked while the latest run status is `WAITING_CI` (status is authoritative; missing `fitness:pending` events must not open Accept).

## Credential / deletion

- Soft-delete workspace purges sealed GitHub tokens immediately (`credentials.purged` audit).
- Hard purge of soft-deleted workspaces runs from the worker every ~5 minutes after 30 days.

## Backoff

- Worker idle poll: `pollMs` (default 1s). On loop errors, exponential backoff up to 30s before the next iteration.
- Do not tight-loop claim on persistent DB errors; restart the process after fixing connectivity.

## Recovery checklist

- [ ] Postgres reachable (`DATABASE_URL`)
- [ ] Migrations applied (`pnpm db:migrate`)
- [ ] Worker process up
- [ ] GitHub App / webhook secret configured (for real delivery)
- [ ] Project budget active and sufficient
