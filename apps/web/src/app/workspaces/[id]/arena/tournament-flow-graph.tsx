"use client";

import styles from "./tournament-flow-graph.module.css";

export type TournamentFlowTournament = {
  id: string;
  n: number;
  status: string;
  winnerRunId: string | null;
  provisional?: boolean;
};

export type TournamentFlowRun = {
  id: string;
  status: string;
  agentProfileKey: string;
  contenderId: string | null;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  tournamentResult: string | null;
  prUrl: string | null;
};

type Props = {
  tournament: TournamentFlowTournament;
  runs: TournamentFlowRun[];
  taskTitle?: string | null;
  selectedContenderId?: string | null;
  onSelectRun?: (run: {
    contenderId: string | null;
    runId: string;
  }) => void;
};

type RunTone = "running" | "waiting" | "attention" | "idle";

function titleCase(key: string): string {
  if (!key) return "Agent";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function runTone(status: string): RunTone {
  switch (status) {
    case "QUEUED":
    case "RUNNING":
      return "running";
    case "VALIDATING":
    case "WAITING_CI":
      return "waiting";
    case "FAILED":
    case "BLOCKED":
    case "EXPIRED":
      return "attention";
    default:
      return "idle";
  }
}

function statusLabel(run: TournamentFlowRun): string {
  if (run.tournamentResult === "WINNER") return "Winner";
  if (run.tournamentResult === "LOSER") return "Loser";
  if (run.tournamentResult === "CANCELLED") return "Cancelled";
  return run.status.replace(/_/g, " ");
}

function toneClass(tone: RunTone): string {
  switch (tone) {
    case "running":
      return styles.nodeRunning ?? "";
    case "waiting":
      return styles.nodeWaiting ?? "";
    case "attention":
      return styles.nodeAttention ?? "";
    default:
      return "";
  }
}

function pillToneClass(tone: RunTone, result: string | null): string {
  if (result === "WINNER") return styles.pillWin ?? "";
  if (result === "LOSER" || result === "CANCELLED") return styles.pillBad ?? "";
  if (tone === "running") return styles.pillRunning ?? "";
  if (tone === "waiting") return styles.pillWaiting ?? "";
  return "";
}

export function TournamentFlowGraph({
  tournament,
  runs,
  taskTitle,
  selectedContenderId,
  onSelectRun,
}: Props) {
  const sorted = [...runs].sort((a, b) => {
    const ea = a.efficiencyScore ?? -1;
    const eb = b.efficiencyScore ?? -1;
    if (eb !== ea) return eb - ea;
    const sa = a.fitnessScore ?? -1;
    const sb = b.fitnessScore ?? -1;
    return sb - sa;
  });

  const resolved = tournament.status === "RESOLVED";
  const open =
    tournament.status === "OPEN" || tournament.status === "SCORING";
  const winner =
    sorted.find(
      (r) =>
        r.tournamentResult === "WINNER" || r.id === tournament.winnerRunId,
    ) ?? null;
  const loserCount = sorted.filter(
    (r) =>
      r.tournamentResult === "LOSER" || r.tournamentResult === "CANCELLED",
  ).length;

  const captionParts = [
    tournament.status.replace(/_/g, " "),
    `N=${tournament.n}`,
  ];
  if (tournament.provisional) {
    captionParts.push("awaiting CI before final decision");
  } else if (resolved && winner) {
    captionParts.push("winner selected");
  }

  const shellClass = [
    styles.flow,
    tournament.provisional
      ? styles.flowProvisional
      : resolved
        ? styles.flowResolved
        : open
          ? styles.flowLive
          : "",
  ]
    .filter(Boolean)
    .join(" ");

  const statusTag = tournament.provisional
    ? {
        className: `${styles.liveTag} ${styles.provisionalTag}`,
        label: "Provisional",
      }
    : resolved
      ? {
          className: `${styles.liveTag} ${styles.resolvedTag}`,
          label: "Resolved",
        }
      : open
        ? { className: styles.liveTag ?? "", label: "Live" }
        : null;

  return (
    <div className={shellClass} aria-label="Tournament flow">
      <div className={styles.header}>
        <p className={styles.caption}>{captionParts.join(" · ")}</p>
        {statusTag ? (
          <span className={statusTag.className}>
            <span className={styles.liveDot} aria-hidden />
            {statusTag.label}
          </span>
        ) : null}
      </div>

      <div className={`${styles.col} ${styles.colTask}`}>
        <div className={`${styles.node} ${styles.nodeTask}`}>
          <p className={styles.eyebrow}>Open ID</p>
          <p className={styles.title}>
            {taskTitle?.trim() ? taskTitle : "Active task"}
          </p>
          <p className={styles.meta}>Fan-out → {tournament.n} contenders</p>
        </div>
      </div>

      <div className={styles.edge} aria-hidden />

      <div className={`${styles.col} ${styles.colRuns}`}>
        <div className={styles.runs} role="list">
          {sorted.map((run) => {
            const tone = runTone(run.status);
            const clickable = Boolean(onSelectRun && run.contenderId);
            const selected =
              selectedContenderId != null &&
              run.contenderId === selectedContenderId;
            const isWinner =
              run.tournamentResult === "WINNER" ||
              run.id === tournament.winnerRunId;
            const isLoser =
              run.tournamentResult === "LOSER" ||
              run.tournamentResult === "CANCELLED";
            const className = [
              styles.node,
              styles.nodeRun,
              toneClass(tone),
              clickable ? styles.nodeRunClickable : "",
              selected ? styles.nodeSelected : "",
              tone === "running" && !resolved ? styles.nodePulse : "",
              isWinner && resolved ? styles.nodeIsWinner : "",
              isLoser && resolved ? styles.nodeIsLoser : "",
            ]
              .filter(Boolean)
              .join(" ");

            const body = (
              <>
                <div className={styles.statusRow}>
                  <p className={styles.title}>
                    {titleCase(run.agentProfileKey)}
                  </p>
                  <span
                    className={`${styles.pill} ${pillToneClass(tone, run.tournamentResult)}`}
                  >
                    {statusLabel(run)}
                  </span>
                </div>
                <p className={styles.meta}>
                  efficiency{" "}
                  {run.efficiencyScore == null
                    ? "—"
                    : run.efficiencyScore.toFixed(3)}
                  {" · "}fitness{" "}
                  {run.fitnessScore == null
                    ? "—"
                    : run.fitnessScore.toFixed(2)}
                </p>
                {run.prUrl ? (
                  <a
                    href={run.prUrl}
                    className={styles.prChip}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    PR →
                  </a>
                ) : null}
              </>
            );

            if (clickable) {
              return (
                <button
                  key={run.id}
                  type="button"
                  role="listitem"
                  className={className}
                  aria-pressed={selected}
                  onClick={() =>
                    onSelectRun?.({
                      contenderId: run.contenderId,
                      runId: run.id,
                    })
                  }
                >
                  {body}
                </button>
              );
            }

            return (
              <div key={run.id} role="listitem" className={className}>
                {body}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.edge} aria-hidden />

      <div className={`${styles.col} ${styles.colScore}`}>
        <div className={`${styles.node} ${styles.nodeScore}`}>
          <p className={styles.eyebrow}>Score</p>
          <p className={styles.title}>Critic · CI · Efficiency</p>
          <p className={styles.meta}>
            {tournament.provisional
              ? "Waiting on CI before final payoff"
              : resolved
                ? "Payoff resolved"
                : "Scoring when runs are ready"}
          </p>
        </div>
      </div>

      <div className={styles.edge} aria-hidden />

      <div className={`${styles.col} ${styles.colOutcomes}`}>
        <div
          className={[
            styles.node,
            styles.nodeWinner,
            winner ? styles.nodeWinnerLit : styles.nodePending,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className={styles.eyebrow}>Winner</p>
          <p className={styles.title}>
            {winner ? titleCase(winner.agentProfileKey) : "Pending"}
          </p>
          <p className={styles.meta}>
            {winner
              ? `Promote · e=${
                  winner.efficiencyScore == null
                    ? "—"
                    : winner.efficiencyScore.toFixed(3)
                }`
              : "Efficiency contest open"}
          </p>
        </div>
        <div
          className={[
            styles.node,
            styles.nodeLoser,
            resolved && loserCount > 0 ? styles.nodeLoserDim : styles.nodePending,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className={styles.eyebrow}>Losers</p>
          <p className={styles.title}>
            {resolved && loserCount > 0
              ? `${loserCount} eliminated`
              : "Pending"}
          </p>
          <p className={styles.meta}>
            {resolved && loserCount > 0
              ? "Budget debit · optional eliminate"
              : "Awaiting resolve"}
          </p>
        </div>
      </div>
    </div>
  );
}
