# WAITING_CI required-check honesty (AG-017)

When a delivery sits in `WAITING_CI`, Accept stays **closed** until required GitHub checks satisfy `CI_REQUIRED_CHECK_NAMES` (default: `test`). Helper jobs that pass alone do **not** open Accept.

## What operators see

| Situation | Evidence / Arena copy |
|-----------|------------------------|
| Required check never reported on the PR head | **Required-missing** — names the missing check(s) and reminds you to align `CI_REQUIRED_CHECK_NAMES` with GitHub check names. |
| Required check pass/fail oscillation | **Flake** — Accept stays closed until CI stabilizes green. |
| Required check failed | **Blocking failure** — fix CI or re-run. |
| Wall-clock timeout (`waiting_ci_timeout`) | Timeout message distinguishes required-missing vs flake vs blocking — never implies Accept-ready. |

Evidence Center rows in `WAITING_CI` show the server `ciWaitingHint`. Arena contender activity lines use the same classification while awaiting CI.

## Configuration

- `CI_REQUIRED_CHECK_NAMES` — comma-separated GitHub check names that gate promote/Accept (worker/Fly env).
- `WAITING_CI_TIMEOUT_MS` — default 6h; stale `WAITING_CI` runs fail with `waiting_ci_timeout`.

## Tests

- `packages/db/src/ci-waiting-honesty.test.ts` — classification + timeout copy
- `packages/db/src/ci-evidence.score.test.ts` — helper greens ≠ accept-ready
- `apps/web/src/lib/hard-gates.test.ts` — required-missing Accept block copy
