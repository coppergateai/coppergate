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
- [x] Container runtime non-root (`USER coppergate` in Dockerfiles)
- [x] Secret egress in logs — telemetry logger redacts tokens/keys
- [x] Docker sandbox mode — `SANDBOX_MODE=docker` (gVisor/runc, network none)
- [ ] Distributed rate limiting (Redis) for multi-instance
- [ ] Make `SANDBOX_MODE=docker` the production default once hosts have Docker

## Sign-off

| Date | Tester | Result | DECISIONS link |
|---|---|---|---|
| | | | |
