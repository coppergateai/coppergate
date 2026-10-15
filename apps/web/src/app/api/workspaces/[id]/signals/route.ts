import {
  SignalError,
  listAutoArmRules,
  listSignalEvents,
  upsertAutoArmRule,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Signal inbox + rules (TASK065). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const provider = url.searchParams.get("provider") ?? undefined;
    const events = await listSignalEvents(db, workspaceId, {
      status,
      provider,
      limit: 100,
    });
    const rules = await listAutoArmRules(db, workspaceId);
    return jsonOk({ events, rules }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Create / update auto-arm rule (owner). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      id?: string;
      projectId?: string | null;
      provider?: string;
      minSeverity?: string;
      pathAllowlist?: string[];
      labelMatch?: string[];
      enabled?: boolean;
      armArena?: boolean;
      profileKeys?: string[];
    };
    const rule = await upsertAutoArmRule(db, {
      workspaceId,
      id: body.id,
      projectId: body.projectId,
      provider: body.provider,
      minSeverity: body.minSeverity,
      pathAllowlist: body.pathAllowlist,
      labelMatch: body.labelMatch,
      enabled: body.enabled,
      armArena: body.armArena,
      profileKeys: body.profileKeys,
      actor: `user:${user.id}`,
    });
    return jsonOk({ rule }, { correlationId, status: body.id ? 200 : 201 });
  } catch (err) {
    if (err instanceof SignalError) {
      return jsonError(
        new ApiError(
          err.code === "not_found" ? "not_found" : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}
