import { createBriefDraft, getProjectForWorkspace } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { generateBriefDraft } from "@coppergate/llm";
import { requireUser } from "@/lib/auth";
import { mapBriefError, serializeBrief } from "@/lib/brief";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Generate a new draft brief revision (LLM stub). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;

    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      idea?: unknown;
      answers?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.idea !== "string" || !body.idea.trim()) {
      throw new ApiError("bad_request", "idea is required");
    }

    let answers: Array<{ id: string; answer: string }> | undefined;
    if (body.answers !== undefined) {
      if (!Array.isArray(body.answers)) {
        throw new ApiError("bad_request", "answers must be an array");
      }
      answers = body.answers
        .filter(
          (a): a is { id: string; answer: string } =>
            !!a &&
            typeof a === "object" &&
            typeof (a as { id: unknown }).id === "string" &&
            typeof (a as { answer: unknown }).answer === "string",
        )
        .slice(0, 3);
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

    const content = generateBriefDraft({
      idea: body.idea,
      projectName: project.project.name,
      answers,
    });

    const brief = await createBriefDraft(db, {
      workspaceId: body.workspaceId,
      projectId,
      actor: user.id,
      rawIdea: body.idea,
      content: {
        title: content.title,
        targetUser: content.targetUser,
        problem: content.problem,
        scope: content.scope,
        nonGoals: content.nonGoals,
        acceptanceCriteria: content.acceptanceCriteria,
        clarifyingAnswers: content.clarifyingAnswers,
      },
    }).catch(mapBriefError);

    logger.info("brief generated", {
      correlationId,
      projectId,
      briefId: brief.id,
      revision: brief.revision,
      needsAnswers: content.needsAnswers,
    });

    return jsonOk(
      {
        brief: serializeBrief(brief),
        needsAnswers: content.needsAnswers,
      },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
