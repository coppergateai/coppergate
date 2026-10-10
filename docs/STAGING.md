# Staging deploy (TASK033)

Goal: open and accept **one real PR** from a staging Coppergate stack without operator DB surgery.

## Architecture

| Piece | Suggested host |
|---|---|
| `apps/web` | Vercel preview/staging project (`apps/web` root) |
| Postgres | Neon / RDS / Compose on a small VM |
| `apps/worker` | Railway / Fly / same VM (`Dockerfile.worker`) |
| GitHub App | Throwaway org; webhook → `https://<staging>/api/integrations/github/webhook` |

## Required env (web + worker)

Copy from `.env.example`, then set:

```bash
NODE_ENV=production
APP_URL=https://staging.example.com
DATABASE_URL=postgresql://…
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

Web and worker **must** share `DATABASE_URL` and `CREDENTIALS_ENCRYPTION_KEY`.

## Deploy steps

1. Provision Postgres; run `DATABASE_URL=… pnpm db:migrate`.
2. Deploy web (Vercel): Root Directory `apps/web`; set env; `APP_URL` = public HTTPS origin.
3. Configure GitHub OAuth callback: `{APP_URL}/api/auth/github/callback`.
4. Configure GitHub App Setup URL: `{APP_URL}/api/integrations/github/callback`.
5. Configure webhook: `{APP_URL}/api/integrations/github/webhook` + same `GITHUB_WEBHOOK_SECRET`.
6. Deploy worker with `GITHUB_DELIVERY_MODE=http` (see `Dockerfile.worker`).
7. Smoke: `STAGING_URL=https://… node scripts/staging-smoke.mjs`
8. Manual path: `scripts/manual-real-pr-path.md`

## Pass criteria (TASK033)

- [ ] `/health` and `/ready` green on staging
- [ ] GitHub App install + one repo connected
- [ ] Worker logs `github delivery resolved` with `mode: "http"`
- [ ] Real PR on `coppergate/task-…` (non-default branch)
- [ ] Accept → task `DONE` in UI without SQL fixes

## Rollback

- Set worker `GITHUB_DELIVERY_MODE=fake` to stop remote writes.
- Soft-delete workspace from settings to purge sealed tokens.
