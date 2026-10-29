import type { RunCiCheckSummary } from "./ci-evidence.js";

/** User-visible WAITING_CI / timeout situations (AG-017). */
export type CiWaitingKind =
  | "required_missing"
  | "flake"
  | "blocking"
  | "awaiting"
  | null;

export type CiCheckHistoryEntry = {
  name: string;
  conclusion: string | null;
  passed: boolean;
  at: Date;
};

export const CI_WAITING_COPY = {
  requiredMissing: (names: string[]) => {
    const list = names.join(", ");
    return names.length === 1
      ? `Required check “${list}” never reported on the PR head — helper greens are not Accept-ready. Match CI_REQUIRED_CHECK_NAMES to GitHub check names.`
      : `Required checks never reported (${list}) — helper greens are not Accept-ready. Match CI_REQUIRED_CHECK_NAMES to GitHub check names.`;
  },
  flake: (name: string) =>
    `Required check “${name}” is flaking (pass/fail oscillation) — Accept stays closed until CI stabilizes green.`,
  blocking: (name: string) =>
    `Required check “${name}” failed — fix CI or re-run; Accept disabled.`,
  awaiting:
    "Awaiting live CI on the PR head — Accept disabled until required checks pass.",
  timeoutRequiredMissing: (names: string[]) => {
    const list = names.join(", ");
    return names.length === 1
      ? `WAITING_CI timed out: required check “${list}” never arrived. Not Accept-ready — verify the workflow reports a check matching CI_REQUIRED_CHECK_NAMES.`
      : `WAITING_CI timed out: required checks never arrived (${list}). Not Accept-ready — verify workflows report checks matching CI_REQUIRED_CHECK_NAMES.`;
  },
  timeoutFlake: (name: string) =>
    `WAITING_CI timed out: required check “${name}” never stabilized green (possible flake). Accept stayed closed.`,
  timeoutBlocking: (name: string) =>
    `WAITING_CI timed out with required check “${name}” still failing — not Accept-ready.`,
  timeoutGeneric:
    "WAITING_CI timed out without accept-ready CI — Accept stayed closed.",
} as const;

export function missingRequiredCheckNames(
  checks: Pick<RunCiCheckSummary, "name">[],
  requiredNames: string[],
): string[] {
  if (requiredNames.length === 0) return [];
  const reported = new Set(checks.map((c) => c.name));
  return requiredNames.filter((n) => !reported.has(n));
}

const FLAKE_WINDOW_MS = 6 * 60 * 60_000;

/** True when a required check both passed and failed within the flake window. */
export function detectRequiredCheckFlake(
  history: CiCheckHistoryEntry[],
  requiredNames: string[],
  nowMs = Date.now(),
): { flaky: boolean; checkName?: string } {
  if (requiredNames.length === 0) return { flaky: false };
  const required = new Set(requiredNames);
  const byName = new Map<string, CiCheckHistoryEntry[]>();
  for (const row of history) {
    if (!required.has(row.name)) continue;
    if (nowMs - row.at.getTime() > FLAKE_WINDOW_MS) continue;
    const list = byName.get(row.name) ?? [];
    list.push(row);
    byName.set(row.name, list);
  }
  for (const [name, rows] of byName) {
    const passed = rows.some((r) => r.passed);
    const failed = rows.some(
      (r) =>
        !r.passed ||
        r.conclusion === "failure" ||
        r.conclusion === "timed_out" ||
        r.conclusion === "cancelled",
    );
    if (passed && failed) return { flaky: true, checkName: name };
  }
  return { flaky: false };
}

function firstBlockingRequiredName(
  checks: RunCiCheckSummary[],
  requiredNames: string[],
): string | null {
  const required = new Set(requiredNames);
  for (const c of checks) {
    if (c.blocksAccept && (!requiredNames.length || required.has(c.name))) {
      return c.name;
    }
  }
  return null;
}

export function classifyCiWaiting(input: {
  checks: RunCiCheckSummary[];
  requiredNames: string[];
  statusAwaitingCi: boolean;
  blocking: boolean;
  passed: boolean;
  checkHistory?: CiCheckHistoryEntry[];
  timedOut?: boolean;
  nowMs?: number;
}): {
  kind: CiWaitingKind;
  detail: string | null;
  arenaLine: string | null;
  missingRequiredNames: string[];
} {
  const missing = missingRequiredCheckNames(input.checks, input.requiredNames);
  const history = input.checkHistory ?? [];
  const flake = detectRequiredCheckFlake(
    history,
    input.requiredNames,
    input.nowMs,
  );

  if (input.timedOut) {
    if (input.blocking) {
      const name =
        firstBlockingRequiredName(input.checks, input.requiredNames) ??
        input.checks.find((c) => c.blocksAccept)?.name ??
        "check";
      return {
        kind: "blocking",
        detail: CI_WAITING_COPY.timeoutBlocking(name),
        arenaLine: CI_WAITING_COPY.timeoutBlocking(name),
        missingRequiredNames: missing,
      };
    }
    if (flake.flaky && flake.checkName) {
      return {
        kind: "flake",
        detail: CI_WAITING_COPY.timeoutFlake(flake.checkName),
        arenaLine: CI_WAITING_COPY.timeoutFlake(flake.checkName),
        missingRequiredNames: missing,
      };
    }
    if (missing.length > 0) {
      return {
        kind: "required_missing",
        detail: CI_WAITING_COPY.timeoutRequiredMissing(missing),
        arenaLine: CI_WAITING_COPY.timeoutRequiredMissing(missing),
        missingRequiredNames: missing,
      };
    }
    return {
      kind: "awaiting",
      detail: CI_WAITING_COPY.timeoutGeneric,
      arenaLine: CI_WAITING_COPY.timeoutGeneric,
      missingRequiredNames: missing,
    };
  }

  if (input.blocking) {
    const name =
      firstBlockingRequiredName(input.checks, input.requiredNames) ??
      input.checks.find((c) => c.blocksAccept)?.name ??
      "check";
    const detail = CI_WAITING_COPY.blocking(name);
    return {
      kind: "blocking",
      detail,
      arenaLine: detail,
      missingRequiredNames: missing,
    };
  }

  if (flake.flaky && flake.checkName) {
    const detail = CI_WAITING_COPY.flake(flake.checkName);
    return {
      kind: "flake",
      detail,
      arenaLine: detail,
      missingRequiredNames: missing,
    };
  }

  if (
    input.requiredNames.length > 0 &&
    missing.length > 0 &&
    (input.statusAwaitingCi || !input.passed)
  ) {
    const detail = CI_WAITING_COPY.requiredMissing(missing);
    return {
      kind: "required_missing",
      detail,
      arenaLine: detail,
      missingRequiredNames: missing,
    };
  }

  if (input.statusAwaitingCi && !input.passed) {
    return {
      kind: "awaiting",
      detail: CI_WAITING_COPY.awaiting,
      arenaLine: CI_WAITING_COPY.awaiting,
      missingRequiredNames: missing,
    };
  }

  return {
    kind: null,
    detail: null,
    arenaLine: null,
    missingRequiredNames: missing,
  };
}

/** Timeout error_message for reaper — never implies Accept-ready. */
export function waitingCiTimeoutMessage(
  input: Parameters<typeof classifyCiWaiting>[0],
): string {
  return (
    classifyCiWaiting({ ...input, timedOut: true }).detail ??
    CI_WAITING_COPY.timeoutGeneric
  );
}
