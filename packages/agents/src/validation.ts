import type { FakeCompletionPayload } from "./types.js";

export type FakeValidationInput = {
  goal: string;
  acceptanceCriteria: string[];
  completion: FakeCompletionPayload;
};

export type FakeValidationReport = {
  passed: boolean;
  summary: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  validator: "fake-v1";
};

/**
 * Deterministic fake validator (TASK016).
 * Fail when goal contains `[FAIL_VALIDATION]` — used in tests.
 * Never marks task DONE; caller decides REVIEW_REQUIRED vs FAILED.
 */
export function runFakeValidation(
  input: FakeValidationInput,
): FakeValidationReport {
  const forceFail = input.goal.includes("[FAIL_VALIDATION]");
  const hasCriteria = input.acceptanceCriteria.length > 0;
  const hasPr = Boolean(input.completion.prUrl && input.completion.headSha);

  const checks = [
    {
      name: "acceptance_criteria_present",
      passed: hasCriteria,
      detail: hasCriteria ? undefined : "No acceptance criteria",
    },
    {
      name: "fake_pr_metadata",
      passed: hasPr,
      detail: hasPr ? undefined : "Missing PR metadata",
    },
    {
      name: "forced_fail_marker",
      passed: !forceFail,
      detail: forceFail ? "Goal contains [FAIL_VALIDATION]" : undefined,
    },
  ];

  const passed = checks.every((c) => c.passed);
  return {
    passed,
    summary: passed
      ? "Fake validation passed — human review still required"
      : "Fake validation failed — auto-completion blocked",
    checks,
    validator: "fake-v1",
  };
}
