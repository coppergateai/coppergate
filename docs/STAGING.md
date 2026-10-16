# Staging deploy (TASK033)

Goal: open and accept **one real PR** from a staging Coppergate stack without operator DB surgery.

## Architecture (live)

| Piece | Host |
|---|---|
| `apps/web` | Vercel project `coppergate` → `https://www.coppergate.ai` |
| Postgres | Fly Postgres `coppergate-db` (web via `coppergate-db.fly.dev` + `sslmode=require`; worker via `.flycast`) |
| `apps/worker` | Fly app `coppergate-worker` (`Dockerfile.worker` + [`fly.toml`](../fly.toml)) |
| GitHub App | `coppergatelocal` on org `coppergateai` |
| Smoke repo | [`coppergateai/coppergate-staging-smoke`](https://github.com/coppergateai/coppergate-staging-smoke) |

## Required env (web + worker)

Copy from `.env.example`, then set:

```bash
NODE_ENV=production
APP_URL=https://www.coppergate.ai
DATABASE_URL=postgresql://…          # same logical DB; host may differ (fly.dev vs flycast)
SESSION_SECRET=<≥32 random chars>
CREDENTIALS_ENCRYPTION_KEY=<64 hex chars>
GITHUB_CLIENT_ID=…
GITHUB_CLIENT_SECRET=…
GITHUB_APP_ID=…
GITHUB_APP_SLUG=…
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n…"
GITHUB_WEBHOOK_SECRET=…
# Worker only — real PRs:
GITHUB_DELIVERY_MODE=http
# Optional real coding agent (else FakeCodingAgent):
# LLM_API_KEY=…
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_MODEL=gpt-4.1-mini
```

Web and worker **must** share the same database and `CREDENTIALS_ENCRYPTION_KEY`.

Sync helper (local `.env` → Vercel + optional Fly): [`scripts/task033-sync-secrets.sh`](../scripts/task033-sync-secrets.sh).

## GitHub App URLs (`coppergatelocal`)

Settings: https://github.com/organizations/coppergateai/settings/apps/coppergatelocal

| Field | Value |
|---|---|
| Homepage | `https://www.coppergate.ai` |
| Callback URL | `https://www.coppergate.ai/api/integrations/github/callback` |
| Setup URL | `https://www.coppergate.ai/api/integrations/github/callback` |
| Webhook Active | ✓ |
| Webhook URL | `https://www.coppergate.ai/api/integrations/github/webhook` |
| Webhook secret | same as `GITHUB_WEBHOOK_SECRET` |

OAuth App (identity login) callback is already `https://www.coppergate.ai/api/auth/github/callback`.

## Deploy steps

1. Provision Postgres; run `DATABASE_URL=… pnpm db:migrate`.
2. Deploy web (Vercel): Root Directory `apps/web`; set env; `APP_URL` = public HTTPS origin.
3. Configure GitHub OAuth + App URLs (table above).
4. Deploy worker: `fly deploy` from repo root (`GITHUB_DELIVERY_MODE=http`).
5. Smoke: `STAGING_URL=https://www.coppergate.ai node scripts/staging-smoke.mjs`
6. Real PR seed (or UI path): `apps/worker/scripts/task033-seed-real-pr.mjs` / [`scripts/manual-real-pr-path.md`](../scripts/manual-real-pr-path.md)
7. Signal closed loop (Sonar ∥ CI-fail): see **Signal → Arena → PR** below; local proof via `node scripts/signal-closed-loop-smoke.mjs`

## Signal → Arena → PR (closed loop)

Local/CI (no staging secrets):

```bash
DATABASE_URL=… pnpm db:migrate
node scripts/signal-closed-loop-smoke.mjs
```

Staging (live GitHub App on `coppergate-staging-smoke`):

1. Workspace has funded arena (`ensureArena` / Settings → Arena) + approved brief.
2. Owner upserts auto-arm for `sonar` or `ci_failure` (`POST /api/workspaces/:id/signals`).
3. Ingest a high-severity envelope (`POST …/signals/ingest`) or fire a real Sonar/CI webhook.
4. Approve task if `min_human` is off; worker claims with `SANDBOX_MODE=local` (optional `CONTENDER_HARNESS=openhands`).
5. Confirm PR on non-default branch + fitness evidence (CI check or Sonar gate artifact).
6. Accept → `DONE`.

Checklist: [`scripts/manual-signal-closed-loop.md`](../scripts/manual-signal-closed-loop.md).

## Pass criteria (TASK033)

- [x] `/health` and `/ready` green on staging (`https://www.coppergate.ai`)
- [x] GitHub App install + one repo connected (`coppergate-staging-smoke`)
- [x] Worker logs `github delivery resolved` with `mode: "http"`
- [x] Real PR on `coppergate/task-…` — [PR #1](https://github.com/coppergateai/coppergate-staging-smoke/pull/1)
- [x] Accept → task `DONE` without operator SQL surgery

## Rollback

- Set worker `GITHUB_DELIVERY_MODE=fake` to stop remote writes (`fly secrets set GITHUB_DELIVERY_MODE=fake -a coppergate-worker`).
- Soft-delete workspace from settings to purge sealed tokens.
