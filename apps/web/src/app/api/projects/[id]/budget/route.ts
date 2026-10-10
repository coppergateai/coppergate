import { setProjectBudget } from "@coppergate/db";
import { BudgetError } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function mapBudgetError(err: unknown): never {
  if (err instanceof BudgetError) {
    switch (err.code) {
      case "not_found":
        throw new ApiError("not_found", err.message);
      case "invalid":
        throw new ApiError("bad_request", err.message);
      case "insufficient":
      case "paused":
        throw new ApiError("conflict", err.message);
    }
  }
  throw err;
}

/** Set project budget cap (owner). */
export async function PUT(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      capMicros?: unknown;
      softAlertMicros?: unknown;
      status?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.capMicros !== "number") {
      throw new ApiError("bad_request", "capMicros must be a number");
    }
    if (
      body.status !== undefined &&
      body.status !== "active" &&
      body.status !== "paused"
    ) {
      throw new ApiError("bad_request", "status must be active or paused");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const budget = await setProjectBudget(db, {
      workspaceId: body.workspaceId,
      projectId,
      capMicros: body.capMicros,
      softAlertMicros:
        typeof body.softAlertMicros === "number"
          ? body.softAlertMicros
          : undefined,
      status: body.status as "active" | "paused" | undefined,
      actor: user.id,
    }).catch(mapBudgetError);

    logger.info("budget set", {
      correlationId,
      projectId,
      capMicros: budget.capMicros,
    });

    return jsonOk(
      {
        budget: {
          id: budget.id,
          projectId: budget.projectId,
          capMicros: budget.capMicros,
          softAlertMicros: budget.softAlertMicros,
          currency: budget.currency,
          status: budget.status,
        },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
