import { getLatestBriefForProject, listBriefsForProject } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { serializeBrief } from "@/lib/brief";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Latest brief (+ optional history) for a project. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId query is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);
    const latest = await getLatestBriefForProject(db, workspaceId, projectId);
    const history =
      url.searchParams.get("history") === "1"
        ? await listBriefsForProject(db, workspaceId, projectId)
        : [];

    return jsonOk(
      {
        brief: latest ? serializeBrief(latest) : null,
        history: history.map(serializeBrief),
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
