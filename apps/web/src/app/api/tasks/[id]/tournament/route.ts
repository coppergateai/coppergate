import {
  getLatestTournamentForTask,
  listArtifactsForRun,
  listRunsForTournament,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { serializeRun } from "@/lib/run";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

type FitnessBreakdown = {
  ci: number;
  validation: number;
  delivery: number;
  criticPenalty: number;
  sonar: number;
  coverage: number;
  e2e: number;
  meaningful: number;
};

function parseFitnessReport(meta: string | null): {
  reasons: string[];
  breakdown: FitnessBreakdown | null;
  signals: { ciPassed?: boolean | null; stubOrToy?: boolean | null } | null;
} | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as {
      inlineBody?: string;
      summary?: string;
    };
    const raw = parsed.inlineBody
      ? (JSON.parse(parsed.inlineBody) as {
          reasons?: string[];
          breakdown?: FitnessBreakdown;
          signals?: { ciPassed?: boolean | null; stubOrToy?: boolean | null };
        })
      : null;
    if (!raw) return null;
    return {
      reasons: Array.isArray(raw.reasons) ? raw.reasons : [],
      breakdown: raw.breakdown ?? null,
      signals: raw.signals ?? null,
    };
  } catch {
    return null;
  }
}

/** Latest / open tournament + contender runs for a task (TASK054). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const tournament = await getLatestTournamentForTask(db, {
      workspaceId,
      taskId,
    });

    if (!tournament) {
      return jsonOk({ tournament: null, runs: [] }, { correlationId });
    }

    const runs = await listRunsForTournament(db, {
      workspaceId,
      tournamentId: tournament.id,
    });

    const awaitingCi = runs.some((r) => r.status === "WAITING_CI");
    const provisional =
      tournament.status === "OPEN" || tournament.status === "SCORING"
        ? awaitingCi
        : false;

    const enriched = await Promise.all(
      runs.map(async (run) => {
        const base = serializeRun(run);
        let fitnessReasons: string[] = [];
        let fitnessBreakdown: FitnessBreakdown | null = null;
        if (run.fitnessEvidenceRef || run.fitnessScore != null) {
          const arts = await listArtifactsForRun(db, workspaceId, run.id);
          const report = arts.find((a) => a.kind === "fitness_report");
          const parsed = parseFitnessReport(report?.meta ?? null);
          if (parsed) {
            fitnessReasons = parsed.reasons;
            fitnessBreakdown = parsed.breakdown;
          }
        }
        return {
          ...base,
          fitnessReasons,
          fitnessBreakdown,
        };
      }),
    );

    return jsonOk(
      {
        tournament: {
          id: tournament.id,
          taskId: tournament.taskId,
          n: tournament.n,
          status: tournament.status,
          winnerRunId: tournament.winnerRunId,
          provisional,
          createdAt: tournament.createdAt.toISOString(),
          updatedAt: tournament.updatedAt.toISOString(),
        },
        runs: enriched,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
