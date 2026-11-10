import {
  parseReproCommandArgv,
  type BisectPlan,
  type BisectStep,
} from "@coppergate/signals";
import { resolveSandboxExecTimeoutMs } from "./exec-timeout.js";
import { SandboxPolicyError } from "./policy.js";
import type { ExecResult, SandboxHandle, SandboxManager } from "./types.js";

const BISECT_SETUP_TIMEOUT_MS = 60_000;
const BISECT_REPRO_TIMEOUT_MS = 5 * 60_000;

export type RegressionBisectExecStep = {
  label: string;
  exitCode: number;
  durationMs: number;
  timeoutMs: number;
};

export type RegressionBisectExecResult = {
  status: "completed" | "hard_timeout" | "failed";
  stepsRun: number;
  elapsedMs: number;
  lastExitCode?: number;
  steps: RegressionBisectExecStep[];
};

/**
 * Run a {@link planRegressionBisect} plan inside the sandbox, honoring
 * {@link BisectPlan.timeoutMs} as a hard wall-clock budget across all exec calls.
 */
export async function execRegressionBisectPlan(
  manager: SandboxManager,
  sandbox: SandboxHandle,
  plan: BisectPlan,
  options?: {
    fakeSteps?: BisectStep[];
    now?: () => number;
  },
): Promise<RegressionBisectExecResult> {
  const nowFn = options?.now ?? Date.now;
  const started = nowFn();
  const hardDeadlineMs = started + plan.timeoutMs;
  const steps: RegressionBisectExecStep[] = [];

  const finish = (
    status: RegressionBisectExecResult["status"],
    lastExitCode?: number,
  ): RegressionBisectExecResult => ({
    status,
    stepsRun: steps.length,
    elapsedMs: nowFn() - started,
    lastExitCode,
    steps,
  });

  async function execStep(
    label: string,
    command: string[],
    preferredMs: number,
  ): Promise<ExecResult> {
    const timeoutMs = resolveSandboxExecTimeoutMs(
      { timeoutMs: preferredMs, hardDeadlineMs },
      nowFn(),
    );
    const result = await manager.exec(sandbox, command, {
      timeoutMs,
      hardDeadlineMs,
    });
    steps.push({
      label,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timeoutMs,
    });
    return result;
  }

  try {
    if (options?.fakeSteps && options.fakeSteps.length > 0) {
      const fake = options.fakeSteps.slice(0, plan.maxSteps);
      for (const step of fake) {
        if (nowFn() >= hardDeadlineMs) {
          return finish("hard_timeout", steps.at(-1)?.exitCode);
        }
        const argv = parseReproCommandArgv(step.command);
        const result = await execStep(
          `fake-repro:${step.stepIndex}`,
          argv,
          BISECT_REPRO_TIMEOUT_MS,
        );
        if (result.exitCode !== 0) {
          return finish("failed", result.exitCode);
        }
      }
      return finish("completed", 0);
    }

    await execStep("bisect-start", ["git", "bisect", "start"], BISECT_SETUP_TIMEOUT_MS);
    const bad = await execStep(
      "bisect-bad",
      ["git", "bisect", "bad", plan.badSha],
      BISECT_SETUP_TIMEOUT_MS,
    );
    if (bad.exitCode !== 0) {
      return finish("failed", bad.exitCode);
    }
    const good = await execStep(
      "bisect-good",
      ["git", "bisect", "good", plan.goodSha],
      BISECT_SETUP_TIMEOUT_MS,
    );
    if (good.exitCode !== 0) {
      return finish("failed", good.exitCode);
    }

    const reproArgv = parseReproCommandArgv(plan.reproCommand);
    const remaining = hardDeadlineMs - nowFn();
    if (remaining <= 0) {
      return finish("hard_timeout", good.exitCode);
    }
    const run = await execStep(
      "bisect-run",
      ["git", "bisect", "run", ...reproArgv],
      remaining,
    );
    if (run.exitCode !== 0) {
      return finish("failed", run.exitCode);
    }
    return finish("completed", 0);
  } catch (err) {
    if (err instanceof SandboxPolicyError && err.code === "timeout") {
      return finish("hard_timeout", steps.at(-1)?.exitCode);
    }
    throw err;
  }
}
