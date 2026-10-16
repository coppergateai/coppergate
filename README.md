# Coppergate

Autonomous multi-agent Survivor arena — agents compete, fitness gates winners, losers lose budget. GitHub PR + CI is the first fitness wedge.

**Slogan:** Build inside the gate. Survive to ship.

Product monorepo. Planning / ADRs: [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) (private).

## Layout

```text
apps/
  web/                 # Next.js UI + BFF (auth, workspaces, signals, arena)
  worker/              # Job poller — claim → sandbox → agent → PR delivery
packages/
  config/              # Zod env schema (fail-fast)
  telemetry/           # Structured logs + funnel + SIGNAL_SLOS
  errors/              # API error envelope
  db/                  # Drizzle schema + domain (tasks, arena, signals)
  auth/                # GitHub/GitLab OAuth + session (+ SSO skeleton)
  github/              # GitHub App JWT, install tokens, AES-GCM seal
  gitlab/              # GitLab OAuth + MR delivery
  scm/                 # Shared SCM helpers; Bitbucket/ADO HTTP clients (deferred live path)
  signals/             # Signal Adapter contract + vendor normalizers
  agents/              # FakeCodingAgent, OpenAI-compatible, ContenderHarness
  sandbox/             # LocalSandboxManager (+ Docker/gVisor policy)
  llm/                 # Brief/plan generation (LLM when configured, else deterministic)
  eslint-config/
  typescript-config/
  coppergate/          # npm name reserve (placeholder SDK)
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

Worker env notes:

| Variable | Default | Notes |
|---|---|---|
| `SANDBOX_MODE` | `local` | Set `off` to skip LocalSandboxManager |
| `CONTENDER_HARNESS` | _(unset)_ | `openhands` for sandbox-backed BYO harness |
| `GITHUB_DELIVERY_MODE` | `fake` | `http` for real GitHub/GitLab PRs/MRs |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm lint` | ESLint across packages |
| `pnpm typecheck` | TypeScript across packages |
| `pnpm test` | Node test runner |
| `pnpm build` | Build all packages/apps |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:migrate:down` | Roll back baseline migration |

Closed-loop signal proof (needs `DATABASE_URL`):

```bash
pnpm --filter @coppergate/worker test -- e2e-signal-closed-loop
```

## Discovery landing

Public `/` is the early-access landing (Phase 0). Signups go to `waitlist_signups` via `POST /api/waitlist`.

## Self-host (community / MIT)

Run web + worker + Postgres on your own domain (e.g. `https://coppergate.shopify.com`) with GitHub and/or GitLab:

```bash
cp .env.selfhost.example .env.selfhost
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build
```

Full guide (DNS, GitHub App + GitLab OAuth URLs, limitations): [`docs/SELF_HOST.md`](./docs/SELF_HOST.md).  
License: MIT. Hosted SaaS remains the commercial offering — see architecture [`DECISIONS.md`](https://github.com/coppergateai/coppergate-architecture/blob/main/docs/DECISIONS.md) (D4 / D9 / D12).

## Deploy (Vercel)

1. Import [`coppergateai/coppergate`](https://github.com/coppergateai/coppergate).
2. Set **Root Directory** to `apps/web` (uses `apps/web/vercel.json`).
3. Env: `DATABASE_URL`, `APP_URL` (e.g. `https://coppergate.ai`), `SESSION_SECRET` (≥32 chars). OAuth optional until login is used.
4. Migrate prod DB: `DATABASE_URL=… pnpm db:migrate`.
5. Attach `coppergate.ai` (Vercel DNS + ImprovMX — see architecture `EMAIL.md`).

**Staging (TASK033):** see [`docs/STAGING.md`](./docs/STAGING.md) — web + worker + `GITHUB_DELIVERY_MODE=http` + `scripts/staging-smoke.mjs`.

## Status

Private beta: MVP + Survivor arena + Signal foundation shipped. Live SCM delivery is **GitHub App + GitLab**; Bitbucket/Azure DevOps HTTP clients exist but the worker install/auth path is **deferred** until the GitHub closed loop is green on staging. Do not claim “production ready” until Phase X go/no-go (`docs/PRODUCTION_READINESS.md`).

See architecture `MVP_BACKLOG.md`, `PRODUCTION_SIGNAL_BACKLOG.md`, `/docs`, [`docs/SIGNALS.md`](./docs/SIGNALS.md), [`docs/PRIVATE_BETA.md`](./docs/PRIVATE_BETA.md).

## Related repos

| Repo | Role |
|------|------|
| [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) | Spec / ADRs / backlog / brand |
| [`coppergate-examples`](https://github.com/coppergateai/coppergate-examples) | Next.js fixture for e2e / agent PRs |
| [`.github`](https://github.com/coppergateai/.github) | Org profile |
