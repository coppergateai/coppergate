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

function titleCase(key: string): string {
  if (!key) return "Agent";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Compact Linear-style strip — replaces the boxed pipeline flowchart. */
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

  const tag = tournament.provisional
    ? { className: `${styles.tag} ${styles.tagProvisional}`, label: "Provisional" }
    : resolved
      ? { className: `${styles.tag} ${styles.tagResolved}`, label: "Resolved" }
      : open
        ? { className: styles.tag ?? "", label: "Live" }
        : null;

  const title = taskTitle?.trim() || "Active Open ID";
  const outcome = tournament.provisional
    ? "Scoring when CI is ready"
    : winner
      ? `Winner · ${titleCase(winner.agentProfileKey)}${
          winner.efficiencyScore == null
            ? ""
            : ` · e=${winner.efficiencyScore.toFixed(3)}`
        }`
      : open
        ? `${tournament.n} contenders · efficiency contest`
        : tournament.status.replace(/_/g, " ");

  return (
    <div className={styles.strip} aria-label="Tournament status">
      <div className={styles.left}>
        <p className={styles.openId} title={title}>
          {title}
        </p>
        <p className={styles.meta}>
          N={tournament.n}
          {" · "}
          {tournament.status.replace(/_/g, " ")}
        </p>
        {tag ? (
          <span className={tag.className}>
            <span
              className={`${styles.dot} ${open && !tournament.provisional ? styles.dotLive : ""}`}
              aria-hidden
            />
            {tag.label}
          </span>
        ) : null}
      </div>
      <div className={styles.right}>
        <div className={styles.runners} role="list">
          {sorted.slice(0, 6).map((run) => {
            const selected =
              selectedContenderId != null &&
              run.contenderId === selectedContenderId;
            const isWinner =
              run.tournamentResult === "WINNER" ||
              run.id === tournament.winnerRunId;
            const clickable = Boolean(onSelectRun && run.contenderId);
            const className = [
              styles.runner,
              selected ? styles.runnerSelected : "",
              isWinner ? styles.runnerWin : "",
            ]
              .filter(Boolean)
              .join(" ");
            const label = `${titleCase(run.agentProfileKey)}${
              run.efficiencyScore == null
                ? ""
                : ` · e=${run.efficiencyScore.toFixed(2)}`
            }`;
            if (!clickable) {
              return (
                <span key={run.id} role="listitem" className={className}>
                  {label}
                </span>
              );
            }
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
                {label}
              </button>
            );
          })}
        </div>
        <p className={styles.outcome}>
          <strong>{outcome}</strong>
        </p>
      </div>
    </div>
  );
}
