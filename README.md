# Coppergate

AI-native product execution platform — idea → brief → plan → isolated coding run → PR + evidence → human review.

**Slogan:** Build inside the gate. Ship when you open it.

Product monorepo. Planning / ADRs: [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) (private).

## Layout

```text
apps/
  web/                 # Next.js UI + BFF (auth, workspaces, /health)
  worker/              # Job poller stub
packages/
  config/              # Zod env schema (fail-fast)
  telemetry/           # Structured logs + OTel stubs
  errors/              # API error envelope
  db/                  # Drizzle schema + migrations
  auth/                # GitHub OAuth + session helpers
  github/              # GitHub App JWT, install tokens, AES-GCM seal
  eslint-config/
  typescript-config/
  coppergate/          # npm name reserve (placeholder)
```

## Prerequisites

- Node.js **22+**
- [pnpm](https://pnpm.io) 9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- Docker (Postgres + Redis)

## Local setup

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm --filter @coppergate/web dev
```

- App: http://localhost:3000  
- Login: http://localhost:3000/login (needs `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`)  
- Liveness: http://localhost:3000/health  
- Readiness: http://localhost:3000/ready  

Postgres is published on host port **5433** (avoids clashing with a local Postgres on 5432).

```bash
pnpm db:migrate:down   # rollback baseline
pnpm --filter @coppergate/worker dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm lint` | ESLint across packages |
| `pnpm typecheck` | TypeScript across packages |
| `pnpm test` | Node test runner |
| `pnpm build` | Build all packages/apps |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:migrate:down` | Roll back baseline migration |

## Discovery landing

Public `/` is the early-access landing (Phase 0). Signups go to `waitlist_signups` via `POST /api/waitlist`.

## Deploy (Vercel)

1. Import [`coppergateai/coppergate`](https://github.com/coppergateai/coppergate).
2. Set **Root Directory** to `apps/web` (uses `apps/web/vercel.json`).
3. Env: `DATABASE_URL`, `APP_URL` (e.g. `https://coppergate.ai`), `SESSION_SECRET` (≥32 chars). OAuth optional until login is used.
4. Migrate prod DB: `DATABASE_URL=… pnpm db:migrate`.
5. Attach `coppergate.ai` (Cloudflare DNS — see architecture `EMAIL.md`).

**Staging (TASK033):** see [`docs/STAGING.md`](./docs/STAGING.md) — web + worker + `GITHUB_DELIVERY_MODE=http` + `scripts/staging-smoke.mjs`.

## Status

**TASK001–032** complete (MVP). Phase 2 planned as **TASK033–047** in architecture `MVP_BACKLOG.md` (Slices I–K). See `docs/PRIVATE_BETA.md` and `docs/OPS_RUNBOOK.md`.


## Related repos

| Repo | Role |
|------|------|
| [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) | Spec / ADRs / backlog / brand |
| [`coppergate-examples`](https://github.com/coppergateai/coppergate-examples) | Next.js fixture for e2e / agent PRs |
| [`.github`](https://github.com/coppergateai/.github) | Org profile |
