"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayTaskTitle } from "@/lib/display-title";
import {
  resolveLaneTaskId,
  resolveLaneTaskTitle,
} from "./lane-tournament-task";
import {
  TournamentFlowGraph,
  type TournamentFlowRun,
  type TournamentFlowTournament,
} from "./tournament-flow-graph";

type ContenderRun = {
  taskId: string;
  taskTitle: string;
};

type ContenderView = {
  id: string;
  latestRun: ContenderRun | null;
};

type ProjectLane = {
  contenders: ContenderView[];
};

export type LaneTournamentScore = {
  contenderId: string;
  efficiencyScore: number | null;
  fitnessScore: number | null;
  tournamentResult: string | null;
  prUrl: string | null;
  runStatus: string;
};

type Props = {
  workspaceId: string;
  lane: ProjectLane;
  selectedContenderId?: string | null;
  onSelectContender: (contenderId: string) => void;
  onScores?: (scores: LaneTournamentScore[]) => void;
};

/** Polls task tournament only while mounted (expanded lane). */
export function LaneTournamentFlow({
  workspaceId,
  lane,
  selectedContenderId,
  onSelectContender,
  onScores,
}: Props) {
  const taskId = useMemo(() => resolveLaneTaskId(lane), [lane]);
  const taskTitle = useMemo(
    () => resolveLaneTaskTitle(lane, taskId, displayTaskTitle),
    [lane, taskId],
  );
  const [tournament, setTournament] =
    useState<TournamentFlowTournament | null>(null);
  const [runs, setRuns] = useState<TournamentFlowRun[]>([]);
  const onScoresRef = useRef(onScores);
  onScoresRef.current = onScores;

  const load = useCallback(async () => {
    if (!taskId) {
      setTournament(null);
      setRuns([]);
      onScoresRef.current?.([]);
      return;
    }
    const res = await fetch(
      `/api/tasks/${taskId}/tournament?workspaceId=${encodeURIComponent(workspaceId)}`,
      { credentials: "same-origin" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      tournament?: TournamentFlowTournament | null;
      runs?: TournamentFlowRun[];
    };
    const nextRuns = data.runs ?? [];
    setTournament(data.tournament ?? null);
    setRuns(nextRuns);
    onScoresRef.current?.(
      nextRuns
        .filter((r): r is TournamentFlowRun & { contenderId: string } =>
          Boolean(r.contenderId),
        )
        .map((r) => ({
          contenderId: r.contenderId,
          efficiencyScore: r.efficiencyScore,
          fitnessScore: r.fitnessScore,
          tournamentResult: r.tournamentResult,
          prUrl: r.prUrl,
          runStatus: r.status,
        })),
    );
  }, [taskId, workspaceId]);

  useEffect(() => {
    if (!taskId) {
      setTournament(null);
      setRuns([]);
      onScoresRef.current?.([]);
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(id);
  }, [load, taskId]);

  if (!tournament || runs.length === 0) return null;

  return (
    <TournamentFlowGraph
      tournament={tournament}
      runs={runs}
      taskTitle={taskTitle}
      selectedContenderId={selectedContenderId}
      onSelectRun={({ contenderId }) => {
        if (!contenderId) return;
        onSelectContender(contenderId);
      }}
    />
  );
}
