# SECURITY — production appendix (TASK127)

Companion to product SECURITY posture. Pen-test sign-off lives in architecture DECISIONS when complete.

## In scope for production claim

- Multi-tenant isolation: every signal/run/credential query is workspace-scoped
- Webhook auth: shared secret / HMAC; unknown providers 404
- Ingest quotas: workspace + provider storm shed (`evaluateIngestQuota`)
- Spend caps + kill-switch on arenas
- Credential ciphertext at rest; rotate via `rotateLlmByokCredential`
- No chat-command agent surface; notify is outbound-only

## Explicit non-goals / deferred

- Full Bitbucket/ADO live E2E in every region
- Live Okta/Entra SSO beyond skeleton
- Unrestricted self-spawning agents

## Pen-test checklist

- [ ] Cross-tenant IDOR (signals, approvals, credentials) — remaining surfaces
- [x] CI/fitness headSha attach scoped by workspaceId (no global SHA collision)
- [x] Fitness attach by headSha requires unique run match (else supply runId)
- [x] Webhook secret bypass / replay — workspace-derived HMAC secret (not global root)
- [x] GitHub App install state — TTL (10m) + HMAC always verified + single-use jti
- [x] GitLab install state — signed TTL state + owner authz + single-use jti (no cookie-only bind)
- [x] SSRF via preview smoke / notify / LLM models proxy / MCP / BYOK baseUrl — DNS-resolved checks
- [x] Signal webhook fail-closed when SIGNAL_WEBHOOK_SECRET unset
- [x] Fitness test ingest gated in production (`ALLOW_FITNESS_TEST_INGEST`)
- [x] Demo seed path allowlist (no `*` wildcard)
- [x] Agent/sandbox path traversal — contained path writes + delivery reads
- [x] Local sandbox argv egress — metadata hosts + private IPs (incl. shell -c)
- [x] Local sandbox command deny — network clients, shell -c, interpreter eval flags
- [x] Profile tool gate — FILE writes require `edit` in profileTools
- [x] Browser hardening — CSP / HSTS / frame-ancestors in middleware
- [x] Public share link TTL — default 7d (`DELIVERY_SHARE_TTL_DAYS`)
- [x] Public route rate limits — waitlist / funnel / health / OAuth start / share links
- [x] OAuth login state single-use (GitHub + GitLab) via consumed_signed_states
- [x] Container runtime non-root (`USER coppergate` in Dockerfile.web; Dockerfile.worker drops to `coppergate` via `setpriv` after starting dockerd)
- [x] Secret egress in logs — telemetry logger redacts tokens/keys
- [x] Docker sandbox mode — `SANDBOX_MODE=docker` (gVisor/runc, network none)
- [x] Local sandbox fails closed in production — `SANDBOX_MODE=local` + `NODE_ENV=production` fails runs with `sandbox_local_forbidden` unless `ALLOW_LOCAL_SANDBOX=1` (SEC-037)
- [ ] Distributed rate limiting (Redis) for multi-instance
- [x] Hosted (Fly) worker on `SANDBOX_MODE=docker` — dockerd + gVisor inside the worker Machine (see below)
- [x] Docker sandbox refuses the `runc` fallback in production unless `SANDBOX_ALLOW_RUNC=1`

## Sandbox mode

| Mode | Isolation | Production |
|---|---|---|
| `docker` | Container per command: gVisor `runsc` (falls back to `runc`), `--network=none`, read-only rootfs, `--cap-drop ALL`, `no-new-privileges`, no `docker.sock` | Recommended |
| `local` | None. Host child process; command-name denylist only (`node script.js`, `npm run x` still run arbitrary code); host network and host filesystem as the worker user | Refused unless `ALLOW_LOCAL_SANDBOX=1` |
| `off` | No sandbox; agent output is not executed, validation is fake | Allowed, but no real PR validation |

### Docker mode details

- Containers run as the worker's own uid (the workdir is a `0700` `mkdtemp`), with `HOME=/tmp` and a per-sandbox host cache dir mounted at `/cache` (Go module/build cache, npm/pnpm/yarn caches, `GOTMPDIR`; `/tmp` is `noexec`).
- **Network:** every command runs with `--network=none` except an exact-argv allowlist of fetch-only commands that download packages without running repository code: `pnpm install --lockfile-only --ignore-scripts`, `npm install --package-lock-only --ignore-scripts`, `yarn install --mode=update-lockfile`, `go mod download`. Those get `--network=bridge` with registries pinned through env (`npm_config_registry`, `YARN_NPM_REGISTRY_SERVER`, `GOPROXY=https://proxy.golang.org`, so repo `.npmrc` / `.yarnrc.yml` cannot redirect them; private Go modules are not fetched). Offline commands get `GOPROXY=off`.
- Stack validation runs `go mod download` (fetch-only) before the offline `go test`.
- `SANDBOX_IMAGE` overrides the image (default `coppergate/sandbox-node22:gvisor`).

### Hosted worker on Fly Machines

A Fly Machine is a Firecracker microVM, so the worker image runs its own Docker daemon:

- `docker/worker-entrypoint.sh` starts as root. With `START_DOCKERD=1` it starts `dockerd` (data-root on the `/data` volume, `--icc=false`, fixed public DNS), checks that `runsc` is registered (gVisor uses its default `systrap` platform, since Firecracker has no nested KVM), and installs an egress firewall: bridge containers cannot reach private, link-local, CGNAT or Fly-internal ranges or the VM itself, and IPv6 is off, so the Fly 6PN network is unreachable. It then builds `Dockerfile.sandbox` once per content hash (cached on the volume), exports `SANDBOX_IMAGE`, and drops to `coppergate` with `setpriv`.
- The worker process stays non-root, but `coppergate` is in the `docker` group, which is root-equivalent **inside the VM**. The Firecracker VM is the outer boundary, and gVisor is the boundary between repository code and the worker's env and secrets.
- Without `START_DOCKERD=1` (for example the self-host Compose stack) the entrypoint only drops privileges, as before.

`ALLOW_LOCAL_SANDBOX=1` is a break-glass ack, not a hardening switch: with it, a
malicious repository or prompt can run code on the worker with its env and network.
Only use it on a single-tenant worker whose secrets you are willing to expose to the
repos it builds. See `docs/sandbox-mode-fail-closed.md`.

## Sign-off

| Date | Tester | Result | DECISIONS link |
|---|---|---|---|
| | | | |
