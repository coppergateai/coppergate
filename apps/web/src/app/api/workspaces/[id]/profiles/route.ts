import {
  ProfileError,
  listAgentProfiles,
  updateWorkspaceAgentProfile,
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

/** Bounded agent profile catalog (TASK101). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);
    const profiles = await listAgentProfiles(db, workspaceId);
    return jsonOk({ profiles }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Constrained profile override (TASK103) — no tool escalation. */
export async function PATCH(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const body = (await request.json()) as {
      key?: string;
      promptGuidance?: string;
      strategyDefault?: string;
      maxSpendMicros?: number;
      toolAllowlist?: string[];
    };
    if (!body.key) {
      throw new ApiError("bad_request", "key is required");
    }
    const profile = await updateWorkspaceAgentProfile(db, {
      workspaceId,
      key: body.key,
      actor: `user:${user.id}`,
      promptGuidance: body.promptGuidance,
      strategyDefault: body.strategyDefault,
      maxSpendMicros: body.maxSpendMicros,
      toolAllowlist: body.toolAllowlist,
    });
    return jsonOk({ profile }, { correlationId });
  } catch (err) {
    if (err instanceof ProfileError) {
      return jsonError(
        new ApiError(
          err.code === "not_found"
            ? "not_found"
            : err.code === "forbidden"
              ? "forbidden"
              : "bad_request",
          err.message,
        ),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}
