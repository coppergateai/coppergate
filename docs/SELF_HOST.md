# Self-host Coppergate

Run Coppergate on your own infrastructure (community / MIT tier).  
Example enterprise hostname: `https://coppergate.shopify.com`.

Managed SaaS remains the supported pilot path; this guide is the **community self-host** packaging (D4 / D9).

## Architecture

```text
Browser → https://coppergate.example.com (TLS at your LB)
            → web (Next.js)  ─┐
            → worker         ─┴→ PostgreSQL
            → GitHub.com / GHES and/or GitLab (gitlab.com or self-managed)
            → optional Bitbucket Cloud / Azure DevOps (TASK117–119)
            → optional LLM provider (BYOK)
```

Worker does **not** need a public ingress — only outbound to Postgres, SCM hosts, and LLM.

### GitHub Enterprise Server (TASK119)

Set the installation / delivery API host via `ScmRepoRef.apiBaseUrl` (or provider config) — e.g. `https://github.example.com/api/v3`. Public default remains `https://api.github.com`.

## Prerequisites

- Docker + Docker Compose v2
- A public HTTPS hostname (TLS terminated at your load balancer or reverse proxy)
- Outbound HTTPS to GitHub and/or your GitLab host + LLM provider
- Either a **GitHub** OAuth App + GitHub App, and/or a **GitLab** OAuth Application

## Quick start (Compose)

```bash
cp .env.selfhost.example .env.selfhost
# Edit APP_URL, secrets, and SCM credentials
docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build
```

Services: `postgres`, one-shot `migrate`, `web`, `worker`.

- Health: `GET {APP_URL}/health`
- Ready: `GET {APP_URL}/ready`
- UI: `{APP_URL}/login`

Upgrade: pull/rebuild images, run compose up again (migrate job re-applies pending Drizzle migrations).

## Environment checklist

| Variable | Required | Notes |
|---|---|---|
| `APP_URL` | yes | Public origin, no trailing slash |
| `SESSION_SECRET` | yes | ≥32 characters |
| `CREDENTIALS_ENCRYPTION_KEY` | yes | 64 hex chars (`openssl rand -hex 32`) |
| `POSTGRES_PASSWORD` | yes (Compose) | Injected into `DATABASE_URL` by Compose |
| `GITHUB_*` | if using GitHub | OAuth + App + webhook secret |
| `GITLAB_*` | if using GitLab | Base URL + OAuth + webhook secret |
| `GITHUB_DELIVERY_MODE` / `SCM_DELIVERY_MODE` | for real PRs/MRs | Set `http` in production |
| `LLM_*` | optional | Else FakeCodingAgent or workspace BYOK |
| `CURSOR_API_KEY` / `CURSOR_MODEL` | optional | Single-tenant only: Cursor local SDK when `ALLOW_ENV_LLM_KEYS=1` (or non-production). Hosted multi-tenant must use Settings → LLM BYOK. |
| `ANTHROPIC_API_KEY` / `CLAUDE_CODE_MODEL` | optional | Single-tenant only: Claude Agent SDK when `ALLOW_ENV_LLM_KEYS=1` (or non-production). Prefer Settings → LLM BYOK vendor `claude_code`. |
| `ALLOW_ENV_LLM_KEYS=1` | optional | Permit host `LLM_*` / `CURSOR_*` / `ANTHROPIC_*` env keys (default off in `NODE_ENV=production`) |
| `CONTENDER_HARNESS=cursor_local` \| `claude_code` | optional | Force local agent harness (prefer BYOK routing; needs BYOK or allowed env key) |
| `SANDBOX_MODE` | yes (effectively) | `local` (default), `docker`, or `off` — see [Sandbox mode](#sandbox-mode) |
| `ALLOW_LOCAL_SANDBOX=1` | only with `SANDBOX_MODE=local` | Break-glass ack; without it, production runs fail with `sandbox_local_forbidden` |

Web and worker **must** share the same database and `CREDENTIALS_ENCRYPTION_KEY`.

## GitHub App URLs

Create an OAuth App and a GitHub App owned by **your** org (do not reuse coppergate.ai callbacks).

| Field | Value |
|---|---|
| OAuth callback | `{APP_URL}/api/auth/github/callback` |
| App callback / setup | `{APP_URL}/api/integrations/github/callback` |
| Webhook | `{APP_URL}/api/integrations/github/webhook` |

OAuth scopes: `read:user`, `user:email` (identity only). Repo access is via the GitHub App installation.

## GitLab (gitlab.com or self-managed)

Self-managed example (Shopify-style):

```bash
APP_URL=https://coppergate.shopify.com
GITLAB_BASE_URL=https://gitlab.shopify.com
```

| Field | Value |
|---|---|
| OAuth redirect URI | `{APP_URL}/api/auth/gitlab/callback` (login + workspace connect) |
| Optional alias | `{APP_URL}/api/integrations/gitlab/callback` (forwards to auth callback) |
| Webhook URL | `{APP_URL}/api/integrations/gitlab/webhook` |

OAuth Application scopes: `read_user`, `api`.  
After login, connect a GitLab project from workspace settings (Project Access Token or OAuth-linked install). Delivery creates a **Merge Request** (not a GitHub PR).

`GITLAB_BASE_URL` must be the origin only (no `/api/v4` suffix).

## Enterprise checklist (Shopify-style)

1. DNS `coppergate.shopify.com` → your LB with TLS.
2. Set `APP_URL=https://coppergate.shopify.com`.
3. If GitLab-internal: set `GITLAB_BASE_URL=https://gitlab.shopify.com` and register OAuth + webhooks there.
4. If GitHub.com org: register OAuth App + GitHub App with the URLs above.
5. `docker compose -f docker-compose.selfhost.yml --env-file .env.selfhost up -d --build`.
6. Sign in → create workspace → connect SCM → set BYOK if needed → run a task with `SCM_DELIVERY_MODE=http`.

## Sandbox mode

The worker runs agent and repo commands (`npm run test`, `go test`, lockfile refresh)
inside a sandbox. With `NODE_ENV=production`:

- **`SANDBOX_MODE=local` fails closed.** Every run fails with
  `errorCode=sandbox_local_forbidden` and the worker logs the reason at boot, unless you
  set `ALLOW_LOCAL_SANDBOX=1`. Local mode runs commands as host processes with the
  worker's network and env; the command denylist does not stop `node script.js`.
  Upgrading from an earlier release: runs start failing until you pick one of the options below.
- **`SANDBOX_MODE=docker`** runs each command in a container (gVisor `runsc` if the
  daemon has it, else `runc`) with no network. The worker needs a Docker CLI and a
  daemon it can reach, and the sandbox image (`coppergate/sandbox-node22:gvisor`)
  must be present on that daemon (`SANDBOX_IMAGE`, built from `Dockerfile.sandbox`).
  Production refuses the `runc` fallback unless `SANDBOX_ALLOW_RUNC=1`.
  The worker image can run its own daemon: set `START_DOCKERD=1` and the entrypoint
  starts `dockerd` + gVisor, builds the sandbox image and installs an egress firewall
  (this is how the hosted worker runs on Fly). In Compose this needs `privileged: true`
  on the `worker` service and a volume at `/data` (`DOCKER_DATA_ROOT`). Privileged is
  root on your Docker host, so only do this on a host dedicated to Coppergate. Do
  **not** bind-mount the host `docker.sock`: sandbox workdirs would resolve on the host.
- **`SANDBOX_MODE=off`** executes nothing; validation falls back to the fake gate.

For a single-tenant self-host where you trust the repositories you connect, add to
`.env.selfhost`:

```bash
SANDBOX_MODE=local
ALLOW_LOCAL_SANDBOX=1
```

## Limitations (honest)

- **No Helm chart yet** — Compose is the supported pack; adapt to Kubernetes yourself or wait for Phase 2.
- **No SSO / SCIM** — GitHub or GitLab OAuth only.
- **GitHub.com only for GitHub path** — GitHub Enterprise Server host override not shipped.
- **Sandbox** — Compose defaults to local mode (break-glass ack required in production); Docker/gVisor mode needs a privileged worker container (`START_DOCKERD=1`) or a worker on a Docker host. Not a managed VPC fleet.
- **Artifacts** — inline in Postgres (no object store).
- **One primary SCM per workspace** in MVP (GitHub **or** GitLab).
- Marketing waitlist UI is present; gate with `PILOT_INVITE_REQUIRED=true` if needed.
- Leave `NEXT_PUBLIC_GA_MEASUREMENT_ID` unset to avoid Coppergate GA on self-host.

## Related

- Local dev: [README.md](../README.md)
- Staging ops (Coppergate SaaS): private `coppergate-architecture` → `docs/STAGING.md`
- Signal Adapters (D13): [SIGNALS.md](./SIGNALS.md)
- Architecture decisions: `coppergate-architecture` → `DECISIONS.md` (D4, D9, D12, D13)
