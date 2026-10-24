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

- [ ] Cross-tenant IDOR (signals, approvals, credentials)
- [x] Webhook secret bypass / replay — workspace-derived HMAC secret (not global root)
- [x] SSRF via preview smoke / notify / LLM models proxy / MCP — DNS-resolved checks
- [x] Agent/sandbox path traversal — contained path writes + delivery reads
- [x] Profile tool gate — FILE writes require `edit` in profileTools
- [x] Browser hardening — CSP / HSTS / frame-ancestors in middleware
- [x] Public share link TTL — default 7d (`DELIVERY_SHARE_TTL_DAYS`)
- [x] Public route rate limits — waitlist / funnel / health / OAuth start
- [x] Secret egress in logs — telemetry logger redacts tokens/keys
- [x] Docker sandbox mode — `SANDBOX_MODE=docker` (gVisor/runc, network none)
- [ ] Distributed rate limiting (Redis) for multi-instance
- [ ] Make `SANDBOX_MODE=docker` the production default once hosts have Docker

## Sign-off

| Date | Tester | Result | DECISIONS link |
|---|---|---|---|
| | | | |
