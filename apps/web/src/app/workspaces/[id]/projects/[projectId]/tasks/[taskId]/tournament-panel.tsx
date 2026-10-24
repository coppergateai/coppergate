"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./task-detail.module.css";

type TournamentView = {
  id: string;
  n: number;
  status: string;
  winnerRunId: string | null;
};

type ContenderRun = {
  id: string;
  status: string;
  branchName: string | null;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  tournamentResult: string | null;
  prUrl: string | null;
  agentProfileKey: string;
  estimatedCostMicros: number;
  actualCostMicros: number;
};

type Props = {
  workspaceId: string;
  taskId: string;
};

function formatUsd(micros: number): string {
  const dollars = micros / 1_000_000;
  if (!Number.isFinite(dollars) || dollars === 0) return "$0";
  if (dollars < 0.01) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}

export function TournamentPanel({ workspaceId, taskId }: Props) {
  const [tournament, setTournament] = useState<TournamentView | null>(null);
  const [runs, setRuns] = useState<ContenderRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/tasks/${taskId}/tournament?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const data = (await res.json()) as {
      tournament?: TournamentView | null;
      runs?: ContenderRun[];
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load tournament");
      return;
    }
    setTournament(data.tournament ?? null);
    setRuns(data.runs ?? []);
    setError(null);
  }, [taskId, workspaceId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [load]);

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!tournament) {
    return null;
  }

  const sorted = [...runs].sort((a, b) => {
    const ea = a.efficiencyScore ?? -1;
    const eb = b.efficiencyScore ?? -1;
    if (eb !== ea) return eb - ea;
    const sa = a.fitnessScore ?? -1;
    const sb = b.fitnessScore ?? -1;
    return sb - sa;
  });

  const winner = sorted.find(
    (r) =>
      r.tournamentResult === "WINNER" || r.id === tournament.winnerRunId,
  );
  const allQuiet =
    sorted.length > 0 &&
    sorted.every(
      (r) =>
        r.status === "CANCELLED" ||
        r.tournamentResult === "CANCELLED" ||
        r.tournamentResult === "LOSER",
    ) &&
    !winner;

  return (
    <section className={styles.tournament} aria-labelledby="tournament-heading">
      <h2 id="tournament-heading" className={styles.sectionTitle}>
        Arena decision · Efficiency contest
      </h2>
      <p className={styles.muted}>
        Hard gates first, then rank by efficiency. Status{" "}
        <strong>{tournament.status.replace(/_/g, " ")}</strong>
        {" · "}N={tournament.n}
        {tournament.winnerRunId ? " · winner selected" : null}
      </p>

      {allQuiet ? (
        <p className={styles.muted}>
          Contenders cancelled or eliminated — selected run continues below.
        </p>
      ) : null}

      {winner && tournament.status === "RESOLVED" ? (
        <p className={styles.tournamentWhy}>
          Decision: efficiency{" "}
          <strong>
            {winner.efficiencyScore == null
              ? "—"
              : winner.efficiencyScore.toFixed(3)}
          </strong>
          {" · "}fitness{" "}
          {winner.fitnessScore == null ? "—" : winner.fitnessScore.toFixed(2)}
          {" · "}spend{" "}
          {formatUsd(winner.actualCostMicros || winner.estimatedCostMicros)}
        </p>
      ) : null}

      {!allQuiet ? (
        <ul className={styles.tournamentList}>
          {sorted.map((run) => {
            const isWinner =
              run.tournamentResult === "WINNER" ||
              run.id === tournament.winnerRunId;
            const label = run.tournamentResult ?? run.status;
            return (
              <li
                key={run.id}
                className={`${styles.tournamentItem} ${
                  isWinner ? styles.tournamentItemWin : ""
                }`}
              >
                <div className={styles.tournamentTop}>
                  <strong>{run.agentProfileKey}</strong>
                  <span
                    className={`${styles.tournamentPill} ${
                      label === "WINNER"
                        ? styles.tournamentPillWin
                        : label === "LOSER" || label === "CANCELLED"
                          ? styles.tournamentPillBad
                          : ""
                    }`}
                  >
                    {label}
                  </span>
                </div>
                <div className={styles.tournamentMeta}>
                  <span>
                    fitness{" "}
                    {run.fitnessScore == null
                      ? "—"
                      : run.fitnessScore.toFixed(2)}
                  </span>
                  <span>
                    efficiency{" "}
                    {run.efficiencyScore == null
                      ? "—"
                      : run.efficiencyScore.toFixed(3)}
                  </span>
                  <span>{run.branchName ?? "no branch"}</span>
                  <span>
                    {formatUsd(run.actualCostMicros || run.estimatedCostMicros)}
                  </span>
                </div>
                {run.prUrl ? (
                  <a
                    href={run.prUrl}
                    className={styles.inlineLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pull request →
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
