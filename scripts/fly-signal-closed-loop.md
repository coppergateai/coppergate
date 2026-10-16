# Fly unattended signal closed loop

Laptop worker must be **stopped**. Fly app `coppergate-worker` claims from the shared DB.

## Deploy

```bash
# from coppergate repo root
fly deploy -a coppergate-worker
```

`fly.toml` env (committed):

- `GITHUB_DELIVERY_MODE=http`
- `SANDBOX_MODE=local`
- `CONTENDER_HARNESS=openhands`

Secrets (already on Fly from TASK033): `DATABASE_URL`, `CREDENTIALS_ENCRYPTION_KEY`, GitHub App PEM, etc.

## Seed (remote DB only)

```bash
# Use the Fly Postgres URL — do NOT set STAGING_ALLOW_LOCAL
DATABASE_URL='postgres://…@coppergate-db.fly.dev:5432/…?sslmode=require' \
  SIGNAL_PROVIDER=sonar \
  GITHUB_INSTALLATION_ID=… \
  GITHUB_REPO_ID=1416068344 \
  GITHUB_REPO_FULL_NAME=coppergateai/coppergate-staging-smoke \
  pnpm --filter @coppergate/worker exec node --import tsx scripts/seed-signal-closed-loop.mjs
```

Watch:

```bash
fly logs -a coppergate-worker
```

Expect: `claimed run` → `delivery files prepared` (`fromSandbox` ≥ 1) → `github delivery resolved` `mode: http` → `run awaiting review`.

## Accept

```bash
LOOKUP_PR_URL='https://github.com/coppergateai/coppergate-staging-smoke/pull/N' \
  DATABASE_URL='…same remote…' \
  pnpm --filter @coppergate/worker exec node --import tsx scripts/accept-task-review.mjs
```

## Local vs Fly proof

| Path | Proven |
|---|---|
| Local worker + local DB + http delivery | PR #2, #3 → DONE |
| Fly worker + remote DB | Deploy `fly.toml` harness env; seed per this doc |
