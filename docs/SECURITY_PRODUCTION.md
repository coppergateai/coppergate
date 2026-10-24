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
- [ ] Rate-limit evasion / provider flood
- [x] SSRF via preview smoke / notify / LLM models proxy — `assertSafeServerFetchUrl`
- [x] Agent/sandbox path traversal — `resolveContainedPath` on writes + delivery reads
- [ ] Secret egress in harness logs

## Sign-off

| Date | Tester | Result | DECISIONS link |
|---|---|---|---|
| | | | |
