# Production readiness checklist (TASK129)

Use with `PRODUCTION_SIGNAL_BACKLOG.md` Phase X. Do **not** claim “production ready” until go/no-go is explicit.

## Adapters & fitness

- [x] Closed-loop unit/integration: Sonar + CI-fail → arena → PR → fitness (`apps/worker/src/e2e-signal-closed-loop.test.ts`)
- [x] Staging E2E: Sonar → arena → **live** PR on smoke repo — [PR #2](https://github.com/coppergateai/coppergate-staging-smoke/pull/2) (2026-10-16; seed + local worker `GITHUB_DELIVERY_MODE=http`)
- [x] Signal Accept → DONE — [PR #2](https://github.com/coppergateai/coppergate-staging-smoke/pull/2) + [PR #3](https://github.com/coppergateai/coppergate-staging-smoke/pull/3) (`accept-task-review.mjs`, 2026-10-16)
- [x] Delivery uses sandbox workdir file bodies (`apps/worker/src/delivery-files.ts`; README not stub-overwritten) — proven on PR #3 (`app/page.tsx` real OpenHands content, `fromSandbox: 1`)
- [x] Live CI gate: `check_run` → `ingestCiEvidence` → Accept blocked until green (`getRunCiFitness` / review UI)
- [x] Issue import → queue product path (`Issues` panel **Import → queue**; Sonar seed = secondary)
- [x] Pilot agent default: http delivery → BYOK/OpenAI else OpenHands; Fake only for fake delivery / CI
- [ ] Fitness ingest: coverage, e2e, perf, preview, visual, load (under load)
- [x] Staging proof: issue import → live CI evidence → Accept — [PR #5](https://github.com/coppergateai/coppergate-staging-smoke/pull/5) + CI-fail reject (2026-10-17; `docs/WEDGE.md`)
- [ ] Provider storm shed + workspace ingest quotas verified under load

## Security & tenancy

- [x] Cross-tenant isolation suite (signal IDOR + pure guards) — chaos/failover drill remains
- [x] Credential rotation drill recorded (TASK126) — see sign-off table below
- [ ] Pen-test P0/P1 closed; SECURITY appendix (TASK127)

## Ops

- [x] SLO targets codified: `SIGNAL_SLOS` + `evaluateSloBurn` (`@coppergate/telemetry`)
- [x] On-call alerts on SLO burn (`dispatchSloBurnAlert` + `SLO_ALERT_WEBHOOK` in worker loop)
- [x] Backup restore drill (TASK128) — see `docs/DR.md` sign-off
- [ ] Pen-test appendix (`docs/SECURITY_PRODUCTION.md`) signed

## Enterprise surface

- [x] Bitbucket / ADO PR delivery **explicitly deferred** (HTTP clients exist; worker install/auth not wired; GitHub/GitLab only for pilots)
- [ ] SSO IdP staging (Okta/Entra) beyond skeleton
- [ ] Self-host / GHES smoke

## Worker / harness

- [x] `LocalSandboxManager` wired in `executeClaimedRun` (`SANDBOX_MODE=local` default)
- [x] OpenHands ContenderHarness sandbox-backed MVP (`CONTENDER_HARNESS=openhands`)
- [x] Brief/plan OpenAI-compatible path with deterministic fallback (`@coppergate/llm`)

## Go / no-go

| Date | Decision | Signer | Notes |
|---|---|---|---|
| 2026-10-17 | **conditional go** (private beta) | coppergate-ops | Wedge proven (PR #5); DR + credential rotation drills signed in `DR.md`; SLO webhook wired; pen-test / SSO still open — do **not** claim “production ready”. |

### Drill sign-off (Phase D)

| Drill | Date | Signer | Result |
|---|---|---|---|
| Credential rotation (GitHub App / BYOK) | 2026-10-17 | coppergate-ops | Pass — rotate App private key + BYOK via Settings; worker picks up next token mint |
| Backup restore (`pg_dump` → staging) | 2026-10-17 | coppergate-ops | Pass — restore checklist in `DR.md` executed on staging clone |
