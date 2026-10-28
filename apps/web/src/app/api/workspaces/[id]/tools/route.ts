import {
  ToolDefError,
  deleteWorkspaceToolDef,
  listWorkspaceToolDefs,
  upsertWorkspaceToolDef,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function serializeTool(t: {
  id: string;
  workspaceId: string;
  key: string;
  title: string;
  description: string;
  kind: string;
  targetToken: string | null;
}) {
  return {
    id: t.id,
    workspaceId: t.workspaceId,
    key: t.key,
    title: t.title,
    description: t.description,
    kind: t.kind,
    targetToken: t.targetToken,
  };
}

function mapToolError(err: ToolDefError): ApiError {
  return new ApiError(
    err.code === "not_found"
      ? "not_found"
      : err.code === "forbidden"
        ? "forbidden"
        : "bad_request",
    err.message,
  );
}

export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const tools = (await listWorkspaceToolDefs(db, workspaceId)).map(
      serializeTool,
    );
    return jsonOk({ tools }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      key?: string;
      title?: string;
      description?: string;
      kind?: string;
      targetToken?: string | null;
    };
    if (!body.key || !body.title) {
      throw new ApiError("bad_request", "key and title required");
    }
    const tool = await upsertWorkspaceToolDef(db, {
      workspaceId,
      key: body.key,
      title: body.title,
      description: body.description,
      kind: body.kind,
      targetToken: body.targetToken,
      actor: `user:${user.id}`,
    });
    return jsonOk({ tool: serializeTool(tool) }, { correlationId });
  } catch (err) {
    if (err instanceof ToolDefError) {
      return jsonError(mapToolError(err), correlationId);
    }
    return jsonError(err, correlationId);
  }
}

/** Delete workspace tool def. Query: ?key= */
export async function DELETE(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const url = new URL(request.url);
    const key = url.searchParams.get("key");
    if (!key) throw new ApiError("bad_request", "key is required");
    const result = await deleteWorkspaceToolDef(db, {
      workspaceId,
      key,
      actor: `user:${user.id}`,
    });
    return jsonOk(result, { correlationId });
  } catch (err) {
    if (err instanceof ToolDefError) {
      return jsonError(mapToolError(err), correlationId);
    }
    return jsonError(err, correlationId);
  }
}
