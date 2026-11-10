# Regression bisect hard timeout (AG-023)

`planRegressionBisect` in `@coppergate/signals` builds a bounded bisect plan (max steps + 15m hard cap). AG-023 **enforces** that cap on the sandbox exec path so multi-step bisect cannot exceed the plan budget.

## Flow

| Step | Package | Behavior |
| --- | --- | --- |
| Plan | `@coppergate/signals` | `planRegressionBisect` / `planRegressionBisectFromSignal` — `timeoutMs` capped at `BISECT_HARD_TIMEOUT_MS` |
| Execute | `@coppergate/sandbox` | `execRegressionBisectPlan` — each `SandboxManager.exec` gets `timeoutMs` clamped to remaining plan budget via `hardDeadlineMs` |
| Policy | `@coppergate/sandbox` | `resolveSandboxExecTimeoutMs` — fail-closed `SandboxPolicyError` (`timeout`) when deadline elapsed |

## Signal hints

Optional lines in a `ci_failure` body (or task notes):

```text
good: <7+ hex sha>
bad: <7+ hex sha>
repro: npm test -- path/to.test.ts
```

`head:` is accepted as `bad` when `bad:` is omitted.

## Non-goals

- Does not shell out from `@coppergate/signals` (callers use sandbox exec)
- Does not bypass sandbox command policy (`sh -c` repro strings are split into argv)
- Fake harness uses `fakeBisectSteps` instead of `git bisect run`

## Evidence

- `packages/signals/src/bisect.test.ts`
- `packages/sandbox/src/exec-timeout.test.ts`
- `packages/sandbox/src/bisect-exec.test.ts`
