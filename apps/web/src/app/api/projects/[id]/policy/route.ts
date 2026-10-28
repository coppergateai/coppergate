import {
  effectiveArenaMinHuman,
  ensureArenaForProject,
  getArenaForProject,
  getProjectForWorkspace,
  isAutonomyLevel,
  setArenaMinHuman,
  setProjectAutonomyLevel,
  setProjectMergeEnabled,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Policy presets: autonomy L0/L1/L2 + merge + min_human. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      autonomyLevel?: unknown;
      mergeEnabled?: unknown;
      minHuman?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const bound = await getProjectForWorkspace(db, body.workspaceId, projectId);
    if (!bound) throw new ApiError("not_found", "project not found");

    let project = bound.project;

    if (body.autonomyLevel !== undefined) {
      if (
        typeof body.autonomyLevel !== "string" ||
        !isAutonomyLevel(body.autonomyLevel)
      ) {
        throw new ApiError("bad_request", "autonomyLevel must be L0, L1, or L2");
      }
      project = await setProjectAutonomyLevel(db, {
        workspaceId: body.workspaceId,
        projectId,
        autonomyLevel: body.autonomyLevel,
        actor: user.id,
      });
    }

    if (typeof body.mergeEnabled === "boolean") {
      project = await setProjectMergeEnabled(db, {
        workspaceId: body.workspaceId,
        projectId,
        mergeEnabled: body.mergeEnabled,
        actor: user.id,
      });
    }

    let minHuman: boolean | null = null;
    if (typeof body.minHuman === "boolean") {
      let arena = await getArenaForProject(db, {
        workspaceId: body.workspaceId,
        projectId,
      });
      if (!arena) {
        const ensured = await ensureArenaForProject(db, {
          workspaceId: body.workspaceId,
          projectId,
          actor: user.id,
          minHuman: body.minHuman,
          contenderBudgetMicros: 100_000,
          defaultContenderN: 2,
        });
        arena = ensured.arena;
      }
      if (arena.minHuman !== body.minHuman) {
        arena = await setArenaMinHuman(db, {
          workspaceId: body.workspaceId,
          arenaId: arena.id,
          minHuman: body.minHuman,
          actor: user.id,
        });
      }
      minHuman = arena.minHuman;
    } else {
      const arena = await getArenaForProject(db, {
        workspaceId: body.workspaceId,
        projectId,
      });
      minHuman = arena ? arena.minHuman : null;
    }

    return jsonOk(
      {
        project: {
          id: project.id,
          autonomyLevel: project.autonomyLevel,
          mergeEnabled: project.mergeEnabled,
          maintainerEnabled: project.maintainerEnabled,
        },
        minHuman,
        effectiveMinHuman: effectiveArenaMinHuman(minHuman),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
