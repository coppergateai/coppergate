/** Keep aligned with DEFAULT_PAYOFF_ALPHA in arena.ts (0.25). */
const DEFAULT_PAYOFF_ALPHA = 0.25;

export type EfficiencyBoardRow = {
  contenderId: string;
  profileKey: string;
  runId: string;
  fitnessScore: number | null;
  spendMicros: number;
  efficiencyScore: number | null;
  /** Hard gate: CI fail ⇒ efficiency payoff 0. */
  ciFailed: boolean;
  tournamentResult: string | null;
  rank: number;
};

export type EfficiencyBoard = {
  taskId: string;
  taskTitle: string;
  payoffAlpha: number;
  tournamentStatus: string | null;
  winnerRunId: string | null;
  provisional: boolean;
  rows: EfficiencyBoardRow[];
  winnerPromoteReason: string | null;
};

export type EfficiencyBoardContender = {
  id: string;
  profileKey: string;
  latestRun: {
    id: string;
    status: string;
    taskId: string;
    taskTitle: string;
    actualCostMicros: number;
    fitnessScore: number | null;
    efficiencyScore: number | null;
    errorCode: string | null;
    tournamentResult: string | null;
    updatedAt: string;
  } | null;
};

/** CI fail or other hard gate zeroing efficiency while fitness was scored. */
export function inferCiFailedForPayoff(input: {
  errorCode: string | null;
  fitnessScore: number | null;
  efficiencyScore: number | null;
}): boolean {
  if (input.errorCode === "ci_failed") return true;
  if (input.efficiencyScore !== 0) return false;
  return (
    input.fitnessScore != null &&
    Number.isFinite(input.fitnessScore) &&
    input.fitnessScore > 0
  );
}

export function formatSpendUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (!Number.isFinite(dollars) || dollars === 0) return "$0";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(dollars < 1 ? 3 : 2)}`;
}

export function formatWinnerPromoteReason(input: {
  profileKey: string;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  spendMicros: number;
  alpha: number;
}): string {
  const f =
    input.fitnessScore == null || !Number.isFinite(input.fitnessScore)
      ? "—"
      : input.fitnessScore.toFixed(2);
  const e =
    input.efficiencyScore == null || !Number.isFinite(input.efficiencyScore)
      ? "—"
      : input.efficiencyScore.toFixed(3);
  const spend = formatSpendUsd(input.spendMicros);
  const alpha =
    input.alpha != null && Number.isFinite(input.alpha)
      ? input.alpha.toFixed(2)
      : String(DEFAULT_PAYOFF_ALPHA);
  return `Promoted ${input.profileKey}: e=${e} · f=${f} · spend ${spend} — highest efficiency among qualifying contenders (α=${alpha})`;
}

function pickContestTask(
  contenders: EfficiencyBoardContender[],
): { taskId: string; taskTitle: string } | null {
  const byTask = new Map<
    string,
    { taskTitle: string; count: number; latestMs: number; scored: number }
  >();
  for (const c of contenders) {
    const run = c.latestRun;
    if (!run) continue;
    const prev = byTask.get(run.taskId);
    const t = Date.parse(run.updatedAt);
    const latestMs = Number.isFinite(t) ? t : 0;
    const scored =
      (run.fitnessScore != null && Number.isFinite(run.fitnessScore)) ||
      (run.efficiencyScore != null && Number.isFinite(run.efficiencyScore))
        ? 1
        : 0;
    if (prev) {
      prev.count += 1;
      prev.latestMs = Math.max(prev.latestMs, latestMs);
      prev.scored += scored;
    } else {
      byTask.set(run.taskId, {
        taskTitle: run.taskTitle,
        count: 1,
        latestMs,
        scored,
      });
    }
  }
  let best: { taskId: string; taskTitle: string } | null = null;
  let bestKey = -1;
  for (const [taskId, meta] of byTask) {
    if (meta.count < 2 && meta.scored === 0) continue;
    const key = meta.latestMs;
    if (key > bestKey) {
      bestKey = key;
      best = { taskId, taskTitle: meta.taskTitle };
    }
  }
  return best;
}

function sortRows(rows: Omit<EfficiencyBoardRow, "rank">[]): EfficiencyBoardRow[] {
  const sorted = [...rows].sort((a, b) => {
    const ea = a.efficiencyScore ?? -1;
    const eb = b.efficiencyScore ?? -1;
    if (eb !== ea) return eb - ea;
    const fa = a.fitnessScore ?? -1;
    const fb = b.fitnessScore ?? -1;
    if (fb !== fa) return fb - fa;
    return a.profileKey.localeCompare(b.profileKey);
  });
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

/**
 * Build the efficiency payoff table for the active contest on an Arena lane.
 * e = f / spend^α; stored efficiencyScore already applies CI-fail ⇒ 0.
 */
export function buildEfficiencyBoard(input: {
  payoffAlpha?: number;
  contenders: EfficiencyBoardContender[];
  tournament?: {
    taskId: string;
    status: string;
    winnerRunId: string | null;
  } | null;
}): EfficiencyBoard | null {
  const alpha =
    input.payoffAlpha != null && Number.isFinite(input.payoffAlpha)
      ? Math.max(0, input.payoffAlpha)
      : DEFAULT_PAYOFF_ALPHA;

  const picked =
    input.tournament != null
      ? {
          taskId: input.tournament.taskId,
          taskTitle:
            input.contenders.find(
              (c) => c.latestRun?.taskId === input.tournament!.taskId,
            )?.latestRun?.taskTitle ?? "Current task",
        }
      : pickContestTask(input.contenders);

  if (!picked) return null;

  const rowsRaw: Omit<EfficiencyBoardRow, "rank">[] = [];
  let provisional = false;

  for (const c of input.contenders) {
    const run = c.latestRun;
    if (!run || run.taskId !== picked.taskId) continue;
    if (
      run.status === "WAITING_CI" &&
      input.tournament &&
      (input.tournament.status === "OPEN" ||
        input.tournament.status === "SCORING")
    ) {
      provisional = true;
    }
    rowsRaw.push({
      contenderId: c.id,
      profileKey: c.profileKey,
      runId: run.id,
      fitnessScore: run.fitnessScore,
      spendMicros: run.actualCostMicros,
      efficiencyScore: run.efficiencyScore,
      ciFailed: inferCiFailedForPayoff({
        errorCode: run.errorCode,
        fitnessScore: run.fitnessScore,
        efficiencyScore: run.efficiencyScore,
      }),
      tournamentResult: run.tournamentResult,
    });
  }

  if (rowsRaw.length === 0) return null;

  const rows = sortRows(rowsRaw);
  const winnerRunId = input.tournament?.winnerRunId ?? null;
  const winnerRow =
    winnerRunId != null
      ? rows.find((r) => r.runId === winnerRunId)
      : rows.find((r) => r.tournamentResult === "WINNER");

  const winnerPromoteReason =
    input.tournament?.status === "RESOLVED" && winnerRow
      ? formatWinnerPromoteReason({
          profileKey: winnerRow.profileKey,
          fitnessScore: winnerRow.fitnessScore,
          efficiencyScore: winnerRow.efficiencyScore,
          spendMicros: winnerRow.spendMicros,
          alpha,
        })
      : null;

  return {
    taskId: picked.taskId,
    taskTitle: picked.taskTitle,
    payoffAlpha: alpha,
    tournamentStatus: input.tournament?.status ?? null,
    winnerRunId,
    provisional,
    rows,
    winnerPromoteReason,
  };
}
