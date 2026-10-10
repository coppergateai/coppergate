import { updateBriefDraft } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { mapBriefError, serializeBrief } from "@/lib/brief";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; briefId: string }> };

/** Edit a draft brief. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId, briefId } = await context.params;

    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      title?: unknown;
      targetUser?: unknown;
      problem?: unknown;
      scope?: unknown;
      nonGoals?: unknown;
      acceptanceCriteria?: unknown;
      clarifyingAnswers?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const patch: Parameters<typeof updateBriefDraft>[1]["patch"] = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.targetUser === "string") patch.targetUser = body.targetUser;
    if (typeof body.problem === "string") patch.problem = body.problem;
    if (typeof body.scope === "string") patch.scope = body.scope;
    if (typeof body.nonGoals === "string") patch.nonGoals = body.nonGoals;
    if (Array.isArray(body.acceptanceCriteria)) {
      patch.acceptanceCriteria = body.acceptanceCriteria.filter(
        (x): x is string => typeof x === "string",
      );
    }
    if (Array.isArray(body.clarifyingAnswers)) {
      patch.clarifyingAnswers = body.clarifyingAnswers
        .filter(
          (x): x is { id: string; question: string; answer: string | null } =>
            !!x &&
            typeof x === "object" &&
            typeof (x as { id: unknown }).id === "string" &&
            typeof (x as { question: unknown }).question === "string",
        )
        .slice(0, 3)
        .map((x) => ({
          id: x.id,
          question: x.question,
          answer: typeof x.answer === "string" ? x.answer : null,
        }));
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError("bad_request", "No editable fields provided");
    }

    const brief = await updateBriefDraft(db, {
      workspaceId: body.workspaceId,
      projectId,
      briefId,
      actor: user.id,
      patch,
    }).catch(mapBriefError);

    return jsonOk({ brief: serializeBrief(brief) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
