import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FakeCompletionPayload } from "./types.js";
import {
  runFakeValidation,
  type FakeValidationReport,
} from "./validation.js";

export type StackValidationInput = {
  goal: string;
  acceptanceCriteria: string[];
  completion: FakeCompletionPayload;
  /** Absolute sandbox workdir (git or sim clone). */
  workdir: string | null | undefined;
  /** Project stack label (e.g. nextjs_ts). */
  stack: string | null | undefined;
  /**
   * When true, only run FakeValidation (CI / GITHUB_DELIVERY_MODE=fake).
   */
  forceFake?: boolean;
  /** Sandbox exec: run command in workdir. */
  exec?: (
    command: string[],
    options?: { timeoutMs?: number },
  ) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs: number;
  }>;
};

export type StackValidationReport = {
  passed: boolean;
  summary: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  validator: "fake-v1" | "stack-v1";
};

/**
 * Stack-aware validation (premium Phase B).
 * - forceFake / no workdir / no exec → FakeValidation only.
 * - nextjs_ts with package.json → lint (and test when script present).
 * - go with go.mod → `go test ./...`
 */
export async function runStackValidation(
  input: StackValidationInput,
): Promise<StackValidationReport> {
  const fake = runFakeValidation({
    goal: input.goal,
    acceptanceCriteria: input.acceptanceCriteria,
    completion: input.completion,
  });

  if (input.forceFake || !input.workdir || !input.exec) {
    return fake;
  }

  const stack = (input.stack ?? "nextjs_ts").trim() || "nextjs_ts";
  const checks: StackValidationReport["checks"] = [
    ...fake.checks.map((c) => ({ ...c, name: `fake:${c.name}` })),
  ];

  if (!fake.passed) {
    return {
      passed: false,
      summary: fake.summary,
      checks,
      validator: "stack-v1",
    };
  }

  const goModPath = join(input.workdir, "go.mod");
  let hasGoMod = false;
  try {
    await access(goModPath);
    hasGoMod = true;
  } catch {
    hasGoMod = false;
  }

  if (stack === "go" || hasGoMod) {
    // -p 1 keeps peak RAM low on small worker VMs (Go compile OOMs at 512–2GB).
    // kprompt's suite needs ~2–3+ minutes even locally; Fly shared CPUs need more headroom.
    const goTest = await input.exec(
      ["go", "test", "-p", "1", "-count", "1", "-timeout", "8m", "./..."],
      {
        timeoutMs: 600_000,
      },
    );
    checks.push({
      name: "go_test",
      passed: goTest.exitCode === 0,
      detail:
        goTest.exitCode === 0
          ? undefined
          : (goTest.stderr || goTest.stdout).slice(0, 400),
    });
    const passed = checks.every((c) => c.passed);
    return {
      passed,
      summary: passed
        ? "Go stack validation passed — human review still required"
        : "Go stack validation failed — auto-completion blocked",
      checks,
      validator: "stack-v1",
    };
  }

  const pkgPath = join(input.workdir, "package.json");
  let hasPackageJson = false;
  try {
    await access(pkgPath);
    hasPackageJson = true;
  } catch {
    hasPackageJson = false;
  }

  if (!hasPackageJson) {
    checks.push({
      name: "package_json_present",
      passed: true,
      detail: "No package.json — skipped npm lint/test (non-JS tree)",
    });
    return {
      passed: true,
      summary: "Stack validation skipped (no package.json) — human review still required",
      checks,
      validator: "stack-v1",
    };
  }

  if (stack === "nextjs_ts" || stack === "unknown" || stack.startsWith("node")) {
    const lint = await runNpmScript(
      input.workdir,
      input.exec,
      "lint",
      120_000,
    );
    checks.push({
      name: "npm_lint",
      passed: lint.skipped || lint.exitCode === 0,
      detail: lint.skipped
        ? "lint script not defined — skipped"
        : lint.exitCode === 0
          ? undefined
          : (lint.stderr || lint.stdout).slice(0, 400),
    });

    const test = await runNpmScript(
      input.workdir,
      input.exec,
      "test",
      180_000,
    );
    checks.push({
      name: "npm_test",
      passed: test.skipped || test.exitCode === 0,
      detail: test.skipped
        ? "test script not defined — skipped"
        : test.exitCode === 0
          ? undefined
          : (test.stderr || test.stdout).slice(0, 400),
    });
  } else {
    checks.push({
      name: "stack_supported",
      passed: true,
      detail: `Stack ${stack}: no automated lint/test yet`,
    });
  }

  const passed = checks.every((c) => c.passed);
  return {
    passed,
    summary: passed
      ? "Stack validation passed — human review still required"
      : "Stack validation failed — auto-completion blocked",
    checks,
    validator: "stack-v1",
  };
}

async function runNpmScript(
  workdir: string,
  exec: NonNullable<StackValidationInput["exec"]>,
  script: "lint" | "test",
  timeoutMs: number,
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  skipped: boolean;
}> {
  // Read package.json from the host-side workdir — avoids sandbox `node -e`
  // (blocked by command policy as interpreter eval).
  let hasScript = false;
  try {
    const raw = await readFile(join(workdir, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    hasScript = Boolean(pkg.scripts && typeof pkg.scripts[script] === "string");
  } catch (err) {
    return {
      exitCode: 1,
      stdout: "",
      stderr:
        err instanceof Error
          ? err.message.slice(0, 200)
          : "failed to read package.json scripts",
      skipped: false,
    };
  }
  if (!hasScript) {
    return { exitCode: 0, stdout: "", stderr: "", skipped: true };
  }

  const result = await exec(["npm", "run", script, "--if-present"], {
    timeoutMs,
  });
  return { ...result, skipped: false };
}

/** @deprecated Prefer runStackValidation — re-export for callers. */
export type { FakeValidationReport };
