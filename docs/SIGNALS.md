# Signals (D13) — operator runbook

Production Signal Adapters turn external tools into arena work. Spec: `coppergate-architecture/docs/PRODUCTION_SIGNAL_BACKLOG.md`.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/workspaces/:id/signals` | session member |
| POST | `/api/workspaces/:id/signals` | owner — upsert auto-arm rule |
| POST | `/api/workspaces/:id/signals/ingest` | owner — test envelope |
| POST | `/api/workspaces/:id/signals/:signalId/arm` | owner — manual arm |
| DELETE | `/api/workspaces/:id/signals/:signalId/arm` | owner — dismiss |
| POST | `/api/workspaces/:id/signals/webhooks/:provider` | `X-Coppergate-Signal-Secret` |

Providers shipped:

| Provider | Slice |
|---|---|
| `fake` | N |
| `sonar` | O0 |
| `ci_failure` | R0 |
| `circleci` / `buildkite` / `jenkins` / `bitbucket` | R1 / W (→ same CI envelope) |
| `jira` / `linear` / `azure_boards` / `asana` / `clickup` | Q0–Q1 |
| `sentry` / `datadog` / `bugsnag` | P |
| `pagerduty` / `opsgenie` | P (TTL + spend_cap labels) |
| `codeql` / `semgrep` / `dependabot` / `trivy` | O1 |

Bounded roles (T0): `fixer`, `engineer`, `security`, `perf`, `docs`, `qa` — see `GET /api/workspaces/:id/profiles`.

Notify: Slack / Discord / Teams auto-format from workspace webhook URL.

Operator APIs:

| Path | Purpose |
|---|---|
| `GET .../signals/analytics` | Spend by signal source (TASK109) |
| `GET .../audit/export?from=&to=` | Audit + signal export (TASK110) |
| `POST .../signals/fitness` | `coverage` / `e2e` / `perf` / `preview_smoke` / `visual_regress` / `load` / `sonar` |

## Env

| Variable | Notes |
|---|---|
| `SIGNAL_WEBHOOK_SECRET` | Shared secret (≥8 chars) for webhook verify |
| `SIGNAL_<PROVIDER>_SECRET` | Optional per-provider override |

## Auto-arm

Rules match `provider` (`*` ok), `minSeverity`, optional label/path filters. Matching events create a DRAFT task and call `submitTaskForApproval` (min_human arenas auto-queue + tournament fan-out).

## CI failure reverse path

GitHub `check_run` failures that do **not** attach to an existing Coppergate run are ingested as `ci_failure` signals for workspaces owning that repo (TASK088).

## Sonar fitness

Sonar webhooks with `headSha`/`revision` + quality gate status also attach a validation artifact (`sonar-quality-gate-v1`) used by the rules critic (TASK069).

## Closed-loop proof (Sonar ∥ CI-fail)

Vertical under test (private beta focus):

```text
signal ingest → auto-arm rule → Task → approve → worker sandbox → agent → PR → fitness → REVIEW_REQUIRED
```

- Local/CI: `apps/worker/src/e2e-signal-closed-loop.test.ts` / `node scripts/signal-closed-loop-smoke.mjs`
- Staging health: `STAGING_URL=… node scripts/staging-smoke.mjs`
- Staging checklist: [`scripts/manual-signal-closed-loop.md`](../scripts/manual-signal-closed-loop.md)
- Manual signal seed: `POST /api/workspaces/:id/signals/ingest` with a `sonar` or `ci_failure` envelope after `ensureDefaultAutoArmRule`

Bitbucket/ADO appear as CI envelope providers only; **live PR delivery for those SCMs is deferred**.

## Rate limit

~120 ingests / workspace / minute → HTTP 429.

## Metrics to watch

- Ingest rate / error rate (`signal.ingest` audit)
- Arm rate / fail rate (`signal.arm`, status=`failed`)
- Fingerprint dedupe (`error_message=fingerprint_dedupe`)
