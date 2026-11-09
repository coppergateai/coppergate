# SEC-037 — Production sandbox mode fails closed

`SANDBOX_MODE=local` (`LocalSandboxManager`) runs agent and repo commands as
child processes on the worker host. Its command policy is a denylist on the
command name, so `node script.js` or `npm run x` still executes arbitrary code,
and the process shares the host network. It is not an isolation boundary.

## Behaviour

| `NODE_ENV` | `SANDBOX_MODE` | `ALLOW_LOCAL_SANDBOX` | Result |
|---|---|---|---|
| `production` | `local` (default, or any unknown value) | unset / anything but `1` | Run fails with `sandbox_local_forbidden` before agent work; worker logs the refusal at boot |
| `production` | `local` | `1` | Allowed (break-glass); worker logs a boot warning |
| `production` | `docker` / `off` | — | Allowed |
| not `production` | any | — | Allowed (dev / test) |

The check lives in `apps/worker/src/sandbox-mode.ts`:

- **Run start** (`executeClaimedRun`) is authoritative: the run is marked FAILED
  with `errorCode=sandbox_local_forbidden`, so the refusal is visible in the run UI.
- **Worker boot** (`index.ts`) logs the same error once. The worker does not exit,
  because maintainer / scout ticks need no sandbox and a crash loop would hide the
  reason from the run UI.

## Recommended production setting

`SANDBOX_MODE=docker` on a host with a Docker daemon (gVisor `runsc` preferred;
falls back to `runc`). Containers run with `--network=none`, `--read-only`,
`--cap-drop ALL`, `no-new-privileges`, and never mount `docker.sock`.

## Evidence

- `apps/worker/src/sandbox-mode.test.ts`
- `scripts/assert-sec037-sandbox-mode-fail-closed.mjs`
