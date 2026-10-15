# Production readiness checklist (TASK129)

Use with `PRODUCTION_SIGNAL_BACKLOG.md` Phase X. Do **not** claim “production ready” until go/no-go is explicit.

## Adapters & fitness

- [ ] Staging E2E: Sonar / Sentry / Jira / CI-fail → arena → PR
- [ ] Fitness ingest: coverage, e2e, perf, preview, visual, load
- [ ] Provider storm shed + workspace ingest quotas verified under load

## Security & tenancy

- [ ] Cross-tenant isolation soak (TASK123)
- [ ] Credential rotation drill (TASK126)
- [ ] Pen-test P0/P1 closed; SECURITY appendix (TASK127)

## Ops

- [ ] SLOs: ingest success ≥ 99.5%, arm p95 ≤ 5s, worker lag p95 ≤ 30s
- [ ] On-call alerts on SLO burn
- [ ] Backup restore drill (TASK128) — see `docs/DR.md`
- [ ] Pen-test appendix (`docs/SECURITY_PRODUCTION.md`) signed

## Enterprise surface

- [ ] Bitbucket / ADO PR delivery live or explicitly deferred
- [ ] SSO IdP staging (Okta/Entra) beyond skeleton
- [ ] Self-host / GHES smoke

## Go / no-go

| Date | Decision | Signer | Notes |
|---|---|---|---|
| | | | |
