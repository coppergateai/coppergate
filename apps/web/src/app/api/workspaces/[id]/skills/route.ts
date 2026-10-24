import {
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
      .map((s) => ({
        id: s.id,
        key: s.key,
        title: s.title,
        bodyMarkdown: s.bodyMarkdown,
        version: s.version,
        workspaceId: s.workspaceId,
      }));
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
    return jsonOk(
      {
        skill: {
          id: skill.id,
          key: skill.key,
          title: skill.title,
          bodyMarkdown: skill.bodyMarkdown,
          version: skill.version,
          workspaceId: skill.workspaceId,
        },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
