import { notifyWorkspace } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Owner test ping for configured Slack/Discord/Teams webhook. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const result = await notifyWorkspace(db, {
      event: "review_ready",
      workspaceId,
      message: "Coppergate test ping — notifications are wired.",
      meta: { test: true, correlationId },
    });

    if (!result.webhook && !result.email) {
      throw new ApiError(
        "bad_request",
        "No webhook URL saved and email notify is off — save a HTTPS webhook first",
      );
    }

    logger.info("notify test ping", {
      correlationId,
      workspaceId,
      userId: user.id,
      ...result,
    });

    return jsonOk({ ok: true, ...result }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
