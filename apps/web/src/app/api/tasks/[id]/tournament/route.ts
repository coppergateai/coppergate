import {
  getLatestTournamentForTask,
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

    return jsonOk(
      {
        tournament: {
          id: tournament.id,
          taskId: tournament.taskId,
          n: tournament.n,
          status: tournament.status,
          winnerRunId: tournament.winnerRunId,
          createdAt: tournament.createdAt.toISOString(),
          updatedAt: tournament.updatedAt.toISOString(),
        },
        runs: runs.map(serializeRun),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
