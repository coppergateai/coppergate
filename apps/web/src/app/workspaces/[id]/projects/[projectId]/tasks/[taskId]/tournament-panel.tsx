"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

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
    return (
      <p style={{ color: "#F87171", fontSize: "0.875rem", marginTop: "1.5rem" }}>
        {error}
      </p>
    );
  }

  if (!tournament) {
    return null;
  }

  const sorted = [...runs].sort((a, b) => {
    const sa = a.fitnessScore ?? -1;
    const sb = b.fitnessScore ?? -1;
    return sb - sa;
  });

  return (
    <section style={{ marginTop: "2rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.35rem" }}>
        Tournament
      </h2>
      <p style={{ margin: "0 0 0.85rem", color: "#737373", fontSize: "0.875rem" }}>
        Status <strong style={{ color: "#E5E5E5" }}>{tournament.status}</strong>
        {" · "}N={tournament.n}
        {tournament.winnerRunId ? " · winner selected" : null}
      </p>

      <ul style={list}>
        {sorted.map((run) => {
          const isWinner =
            run.tournamentResult === "WINNER" ||
            run.id === tournament.winnerRunId;
          return (
            <li
              key={run.id}
              style={{
                ...item,
                outline: isWinner ? "1px solid #525252" : undefined,
              }}
            >
              <div style={itemTop}>
                <strong>{run.agentProfileKey}</strong>
                <span style={pill(run.tournamentResult)}>
                  {run.tournamentResult ?? run.status}
                </span>
              </div>
              <div style={itemMeta}>
                <span>
                  fitness{" "}
                  {run.fitnessScore == null
                    ? "—"
                    : run.fitnessScore.toFixed(2)}
                </span>
                <span>{run.branchName ?? "no branch"}</span>
                <span>
                  ${(run.actualCostMicros || run.estimatedCostMicros) / 1_000_000}
                </span>
              </div>
              {run.prUrl ? (
                <a href={run.prUrl} style={link} target="_blank" rel="noreferrer">
                  Pull request →
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function pill(result: string | null): CSSProperties {
  const tone =
    result === "WINNER"
      ? { bg: "#14532D", fg: "#BBF7D0" }
      : result === "LOSER" || result === "CANCELLED"
        ? { bg: "#450A0A", fg: "#FECACA" }
        : { bg: "#262626", fg: "#D4D4D4" };
  return {
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.45rem",
    borderRadius: 999,
    background: tone.bg,
    color: tone.fg,
  };
}

const list: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "grid",
  gap: "0.65rem",
};
const item: CSSProperties = {
  border: "1px solid #262626",
  borderRadius: 8,
  padding: "0.75rem 0.9rem",
  background: "#0A0A0A",
};
const itemTop: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "0.35rem",
};
const itemMeta: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.75rem",
  fontSize: "0.8rem",
  color: "#A3A3A3",
};
const link: CSSProperties = {
  display: "inline-block",
  marginTop: "0.5rem",
  fontSize: "0.8rem",
  color: "#E5E5E5",
};
