#!/usr/bin/env node
/**
 * SEC-037 — production sandbox mode fails closed:
 * - SANDBOX_MODE=local + NODE_ENV=production refused unless ALLOW_LOCAL_SANDBOX=1
 * - executeClaimedRun fails the run with sandbox_local_forbidden before agent work
 * - worker boot surfaces the refusal; no warn-only path remains
 * - docker mode refuses the runc fallback in production; only exact fetch-only
 *   argv gets network
 * - hosted Fly worker runs SANDBOX_MODE=docker without the local break-glass ack
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  const abs = path.join(root, rel);
  assert.ok(fs.existsSync(abs), `missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const policy = read("apps/worker/src/sandbox-mode.ts");
assert.match(policy, /export function evaluateSandboxModePolicy/);
assert.match(policy, /SANDBOX_LOCAL_FORBIDDEN_CODE = "sandbox_local_forbidden"/);
assert.match(policy, /ALLOW_LOCAL_SANDBOX\?\.trim\(\) === "1"/);
assert.match(policy, /NODE_ENV !== "production"/);

const execute = read("apps/worker/src/execute.ts");
assert.match(execute, /evaluateSandboxModePolicy\(\)/);
assert.match(execute, /errorCode: sandboxPolicy\.errorCode/);
assert.doesNotMatch(
  execute,
  /ALLOW_LOCAL_SANDBOX=1 silences/,
  "warn-only local sandbox path must not return",
);
assert.doesNotMatch(
  execute,
  /function resolveSandboxMode/,
  "sandbox mode must resolve through sandbox-mode.ts",
);
// Policy check must run before any sandbox is created.
assert.ok(
  execute.indexOf("evaluateSandboxModePolicy()") <
    execute.indexOf("createSandboxManager(sandboxMode)"),
  "sandbox policy must be evaluated before createSandboxManager",
);

const boot = read("apps/worker/src/index.ts");
assert.match(boot, /evaluateSandboxModePolicy\(\)/);

const tests = read("apps/worker/src/sandbox-mode.test.ts");
assert.match(tests, /refuses local in production without ack/);

assert.match(execute, /requireRunsc:\s*\n?\s*process\.env\.NODE_ENV === "production"/);

const docker = read("packages/sandbox/src/docker.ts");
assert.match(docker, /FETCH_ONLY_COMMANDS/);
assert.match(docker, /egress \? "bridge" : spec\.networkMode/);
assert.match(docker, /requireRunsc/);

const fly = read("fly.toml");
assert.match(fly, /SANDBOX_MODE = "docker"/);
assert.match(fly, /START_DOCKERD = "1"/);
assert.doesNotMatch(fly, /ALLOW_LOCAL_SANDBOX/);
assert.doesNotMatch(fly, /SANDBOX_ALLOW_RUNC/);

const entry = read("docker/worker-entrypoint.sh");
assert.match(entry, /grep -q runsc/);
assert.match(entry, /DOCKER-USER/);
assert.match(entry, /setpriv --reuid=coppergate/);
assert.doesNotMatch(read("Dockerfile.worker"), /docker\.sock/);

console.log("SEC-037 OK: production sandbox fails closed; Fly worker on docker + runsc");
