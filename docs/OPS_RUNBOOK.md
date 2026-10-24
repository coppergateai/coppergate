# Coppergate ops runbook (TASK031)

## Worker crash mid-run

1. Leases expire after `leaseMs` (default 30s). Workers renew via heartbeat (~`leaseMs/3`) during agent/validation work.
2. `reapStaleRuns`: expired **RUNNING** → `QUEUED` (reclaim); expired **VALIDATING** → `FAILED` (`validating_lease_expired`) and the worker fails the matching task. VALIDATING is not silently re-queued.
3. User can **Cancel** then **Retry** from task detail without operator help.
4. Check worker logs for `claimed run` / `run processed` / `lost run lease ownership` / `worker loop iteration failed`.
5. If a run is stuck RUNNING with a fresh lease, cancel it (sets `cancel_requested_at`); the worker cooperatively stops (LLM fetch is also aborted via `AbortSignal`).

## Poison / failing messages

- Validation failures → run `FAILED` + `validation_report` artifact; task `FAILED`; user retries with a new attempt/idempotency key.
- CI failure evidence → `ci_failed` blocks accept; user requests changes or rejects.
- Budget paused / insufficient → enqueue and worker execute fail closed; resume spend in settings.

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
