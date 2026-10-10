# Coppergate

AI-native product execution platform — idea → brief → plan → isolated coding run → PR + evidence → human review.

**Slogan:** Build inside the gate. Ship when you open it.

Product monorepo. Planning / ADRs: [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) (private).

## Layout

```text
apps/
  web/                 # Next.js UI + BFF (/health, /ready)
  worker/              # Job poller stub
packages/
  config/              # Zod env schema (fail-fast)
  telemetry/           # Structured logs + OTel stubs
  errors/              # API error envelope
  db/                  # Drizzle schema + migrations
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

## Status

**TASK001** scaffold + **TASK002** config/telemetry/errors complete. Next: TASK003 (GitHub OAuth session).

## Related repos

| Repo | Role |
|------|------|
| [`coppergate-architecture`](https://github.com/coppergateai/coppergate-architecture) | Spec / ADRs / backlog / brand |
| [`coppergate-examples`](https://github.com/coppergateai/coppergate-examples) | Next.js fixture for e2e / agent PRs |
| [`.github`](https://github.com/coppergateai/.github) | Org profile |
