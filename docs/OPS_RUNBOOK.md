# Coppergate ops runbook (TASK031)

## Worker crash mid-run

1. Leases expire after `leaseMs` (default 30s). `reapStaleRuns` returns RUNNING rows with expired leases to QUEUED.
2. User can **Cancel** then **Retry** from task detail without operator help.
3. Check worker logs for `claimed run` / `run processed` / `worker loop iteration failed`.
4. If a run is stuck RUNNING with a fresh lease, cancel it (sets `cancel_requested_at`); the worker cooperatively stops.

## Poison / failing messages

- Validation failures → run `FAILED` + `validation_report` artifact; task `FAILED`; user retries with a new attempt/idempotency key.
- CI failure evidence → `ci_failed` blocks accept; user requests changes or rejects.
- Budget paused / insufficient → enqueue and worker execute fail closed; resume spend in settings.

## Credential / deletion

- Soft-delete workspace purges sealed GitHub tokens immediately (`credentials.purged` audit).
- Hard purge of soft-deleted workspaces runs from the worker every ~5 minutes after 30 days.

## Backoff

- Worker idle poll: `pollMs` (default 1s). On loop errors, sleeps `pollMs` before the next iteration.
- Do not tight-loop claim on persistent DB errors; restart the process after fixing connectivity.

## Recovery checklist

- [ ] Postgres reachable (`DATABASE_URL`)
- [ ] Migrations applied (`pnpm db:migrate`)
- [ ] Worker process up
- [ ] GitHub App / webhook secret configured (for real delivery)
- [ ] Project budget active and sufficient
