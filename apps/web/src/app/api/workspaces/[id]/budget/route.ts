import {
  BudgetError,
  getWorkspaceSpendSummary,
  setWorkspaceBudget,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceMember, requireWorkspaceOwner } from "@/lib/workspace";

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

/** Workspace pooled spend summary (member). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const usage = await getWorkspaceSpendSummary(db, workspaceId);
    return jsonOk({ usage }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** Set workspace monthly envelope (owner). Pauses project-scoped budgets. */
export async function PUT(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      capMicros?: unknown;
      softAlertMicros?: unknown;
      status?: unknown;
      period?: unknown;
    } | null;

    if (!body || typeof body.capMicros !== "number") {
      throw new ApiError("bad_request", "capMicros must be a number");
    }
    if (
      body.status !== undefined &&
      body.status !== "active" &&
      body.status !== "paused"
    ) {
      throw new ApiError("bad_request", "status must be active or paused");
    }
    if (
      body.period !== undefined &&
      body.period !== "monthly" &&
      body.period !== "lifetime"
    ) {
      throw new ApiError("bad_request", "period must be monthly or lifetime");
    }

    await requireWorkspaceOwner(db, workspaceId, user.id);

    const budget = await setWorkspaceBudget(db, {
      workspaceId,
      capMicros: body.capMicros,
      softAlertMicros:
        typeof body.softAlertMicros === "number"
          ? body.softAlertMicros
          : undefined,
      status: body.status as "active" | "paused" | undefined,
      period: (body.period as "monthly" | "lifetime" | undefined) ?? "monthly",
      actor: user.id,
      pauseProjectBudgets: true,
    }).catch(mapBudgetError);

    const usage = await getWorkspaceSpendSummary(db, workspaceId);

    logger.info("workspace budget set", {
      correlationId,
      workspaceId,
      capMicros: budget.capMicros,
    });

    return jsonOk(
      {
        budget: {
          id: budget.id,
          workspaceId: budget.workspaceId,
          projectId: budget.projectId,
          capMicros: budget.capMicros,
          softAlertMicros: budget.softAlertMicros,
          currency: budget.currency,
          status: budget.status,
          period: budget.period,
        },
        usage,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
