import { listArtifactsForRun } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceMember } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serializeArtifact(a: {
  id: string;
  kind: string;
  contentType: string;
  storageKey: string;
  checksumSha256: string;
  meta: string;
  createdAt: Date;
}) {
  let meta: unknown = {};
  try {
    meta = JSON.parse(a.meta) as unknown;
  } catch {
    meta = {};
  }
  return {
    id: a.id,
    kind: a.kind,
    contentType: a.contentType,
    storageKey: a.storageKey,
    checksumSha256: a.checksumSha256,
    meta,
    createdAt: a.createdAt.toISOString(),
  };
}

/** List artifacts for a run (workspace-scoped). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: runId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);

    const rows = await listArtifactsForRun(db, workspaceId, runId);
    return jsonOk(
      { artifacts: rows.map(serializeArtifact) },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
