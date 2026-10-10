import {
  assertCanStartTasks,
  generateProjectPlan,
  getProjectForWorkspace,
  parseJsonArray,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { generatePlanDraft } from "@coppergate/llm";
import { requireUser } from "@/lib/auth";
import { mapBriefError } from "@/lib/brief";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { mapPlanError, serializePlan } from "@/lib/plan";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Generate draft milestones/tasks from the approved brief (LLM stub). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;

    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const project = await getProjectForWorkspace(
      db,
      body.workspaceId,
      projectId,
    );
    if (!project) {
      throw new ApiError("not_found", "Project not found");
    }

    const brief = await assertCanStartTasks(
      db,
      body.workspaceId,
      projectId,
    ).catch(mapBriefError);

    const draft = generatePlanDraft({
      title: brief.title,
      targetUser: brief.targetUser,
      problem: brief.problem,
      scope: brief.scope,
      nonGoals: brief.nonGoals,
      acceptanceCriteria: parseJsonArray(brief.acceptanceCriteria),
    });

    const plan = await generateProjectPlan(db, {
      workspaceId: body.workspaceId,
      projectId,
      actor: user.id,
      milestones: draft,
    }).catch(mapPlanError);

    logger.info("plan generated", {
      correlationId,
      projectId,
      milestones: plan.milestones.length,
      tasks: plan.milestones.reduce((n, m) => n + m.tasks.length, 0),
    });

    return jsonOk(
      { plan: serializePlan(plan) },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
