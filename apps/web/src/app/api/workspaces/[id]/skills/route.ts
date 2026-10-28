import {
  deleteWorkspaceSkill,
  listAgentSkills,
  upsertWorkspaceSkill,
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

function serializeSkill(s: {
  id: string;
  key: string;
  title: string;
  bodyMarkdown: string;
  version: number;
  workspaceId: string | null;
}) {
  return {
    id: s.id,
    key: s.key,
    title: s.title,
    bodyMarkdown: s.bodyMarkdown,
    version: s.version,
    workspaceId: s.workspaceId,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const rows = await listAgentSkills(db, workspaceId);
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const s of rows) {
      if (!s.workspaceId) {
        if (!byKey.has(s.key)) byKey.set(s.key, s);
      } else {
        byKey.set(s.key, s);
      }
    }
    const skills = [...byKey.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(serializeSkill);
    return jsonOk({ skills }, { correlationId });
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
      bodyMarkdown?: string;
    };
    if (!body.key || !body.title || typeof body.bodyMarkdown !== "string") {
      throw new ApiError("bad_request", "key, title, bodyMarkdown required");
    }
    const skill = await upsertWorkspaceSkill(db, {
      workspaceId,
      key: body.key,
      title: body.title,
      bodyMarkdown: body.bodyMarkdown,
      actor: `user:${user.id}`,
    });
    return jsonOk({ skill: serializeSkill(skill) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Delete workspace skill override (reset) or custom skill. Query: ?key= */
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
    try {
      const result = await deleteWorkspaceSkill(db, {
        workspaceId,
        key,
        actor: `user:${user.id}`,
      });
      return jsonOk(result, { correlationId });
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        throw new ApiError("not_found", err.message);
      }
      throw err;
    }
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
