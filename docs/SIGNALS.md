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
| POST | `/api/workspaces/:id/signals/webhooks/:provider` | `X-Coppergate-Signal-Secret` (workspace-derived) |

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
| `SIGNAL_WEBHOOK_SECRET` | Root secret (≥8 chars). Webhooks must send the **workspace-derived** value, not this root. |
| `SIGNAL_<PROVIDER>_SECRET` | Optional per-provider root; also workspace-derived before verify |

**Workspace webhook secret:** `HMAC-SHA256(root, "v1:signal-webhook:" + workspaceId)` hex digest. Owners can read it from `GET /api/workspaces/:id/signals` (`webhookSecret`). The root env value alone must not authorize ingest into an arbitrary workspace path.

## Auto-arm

Rules match `provider` (`*` ok), `minSeverity`, optional label/path filters. Matching events create a DRAFT task and call `submitTaskForApproval` (min_human arenas auto-queue + tournament fan-out).

## CI failure reverse path

GitHub `check_run` failures that do **not** attach to an existing Coppergate run are ingested as `ci_failure` signals for workspaces owning that repo (TASK088).

**Vercel deploy-fail:** GitHub classic `status` events whose context is Vercel (`Vercel`, `Vercel – Production`, …) and state is `failure`/`error`, when they do **not** attach to an existing run, are also ingested as `ci_failure` (provider tag `vercel`) and auto-armed with `fixer` + `engineer`. Redeploy is **not** an L3 Vercel API call — Accept → merge → Vercel Git integration rebuilds the tip.

## Sonar fitness

Sonar webhooks with `headSha`/`revision` + quality gate status also attach a validation artifact (`sonar-quality-gate-v1`) used by the rules critic (TASK069).

## Wedge depth (D14) — deepen these, not ten half-adapters

| Loop | Status | Operator focus |
|---|---|---|
| **GitHub issue → task → PR** | Primary commercial wedge | Project **Issues** panel; PR body `Closes #N` |
| **CI-fail → fix arena → PR** | Secondary depth | Default auto-arm for `ci_failure`; GitHub check_run + Vercel `status` reverse path |
| **Sentry → fix arena → PR** | Secondary depth | Webhook `sentry` + auto-arm ≥`high`; outbound comment when configured |

Jira/Linear/Sonar/… remain available but are **expand-on-pull** — see [EXPAND_PULL.md](./EXPAND_PULL.md).

## Closed-loop proof (Issue ∥ Sentry ∥ CI-fail)

Vertical under test (private beta focus):

```text
signal ingest → auto-arm rule → Task → approve → worker sandbox → agent → PR → fitness → REVIEW_REQUIRED
```

Issue path (no webhook): import via `POST /api/projects/:id/issues` → same task/PR loop.

- Local/CI: `apps/worker/src/e2e-signal-closed-loop.test.ts` / `node scripts/signal-closed-loop-smoke.mjs`
- Sentry depth: `apps/worker/src/e2e-sentry-wedge.test.ts`
- Staging health: `STAGING_URL=… node scripts/staging-smoke.mjs`
- Staging checklist: [`scripts/manual-signal-closed-loop.md`](../scripts/manual-signal-closed-loop.md)
- Manual signal seed: `POST /api/workspaces/:id/signals/ingest` with a `sentry` or `ci_failure` envelope after `ensureDefaultAutoArmRule`

Bitbucket/ADO appear as CI envelope providers only; **live PR delivery for those SCMs is deferred**.

## Rate limit

~120 ingests / workspace / minute → HTTP 429.

## Metrics to watch

- Ingest rate / error rate (`signal.ingest` audit)
- Arm rate / fail rate (`signal.arm`, status=`failed`)
- Fingerprint dedupe (`error_message=fingerprint_dedupe`)
