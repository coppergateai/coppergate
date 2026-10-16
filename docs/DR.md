# Disaster recovery & backup (TASK128)

## RPO / RTO targets (private beta)

| Metric | Target | Notes |
|---|---|---|
| RPO | ≤ 24h | Daily logical dump of Postgres |
| RTO | ≤ 4h | Restore staging clone + cutover checklist |

## What we back up

- Postgres (primary state: workspaces, signals, runs, credentials ciphertext)
- Object/blob artifacts if detached from DB (none required for MVP wedge)
- Env secrets live in the host secret manager — **not** in git

## Backup (staging / prod)

```bash
# Logical dump (example)
pg_dump "$DATABASE_URL" --format=custom --file="coppergate-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Store dumps encrypted at rest; retain ≥ 14 days for private beta.

## Restore drill

1. Provision empty Postgres.
2. `pg_restore --clean --if-exists -d "$RESTORE_URL" coppergate-….dump`
3. Point a staging web/worker at `RESTORE_URL`.
4. Smoke: login → list workspaces → open one signal → kill-switch still works.
5. Closed-loop regression (optional): `DATABASE_URL=$RESTORE_URL node scripts/signal-closed-loop-smoke.mjs`
6. Record drill date in `PRODUCTION_READINESS.md`.

SLO burn helper for on-call triage: `evaluateSloBurn` / `SIGNAL_SLOS` in `@coppergate/telemetry`.

## Failover notes

- Webhooks: providers retry; ingest is idempotent on fingerprint.
- Worker: at-most-once claim; re-queue failed runs after restore.
- Do not restore credentials plaintext; rotate BYOK after any suspected dump leak (`rotateLlmByokCredential`).

## Migrate production

1. Announce maintenance window.
2. Pause workers (`budget pause` / kill-switch).
3. Final dump → restore on new cluster.
4. Flip DNS / `DATABASE_URL`.
5. Resume workers; watch ingest/arm SLOs (`SIGNAL_SLOS`).
