import {
  DEFAULT_MONTHLY_BUDGET_MICROS,
  disableMaintainerMode,
  enableMaintainerMode,
  getMaintainerMetrics,
  getProjectForWorkspace,
  parseMaintainerPolicy,
  updateMaintainerPolicy,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId required");
    }
    await requireWorkspaceOwner(db, workspaceId, user.id);
    const bound = await getProjectForWorkspace(db, workspaceId, projectId);
    if (!bound) throw new ApiError("not_found", "project not found");

    const policy = parseMaintainerPolicy(bound.project.maintainerPolicyJson);
    const metrics = await getMaintainerMetrics(db, {
      workspaceId,
      projectId,
      days: 30,
    });

    return jsonOk(
      {
        enabled: bound.project.maintainerEnabled,
        policy,
        metrics,
        defaults: { monthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS },
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      action?: unknown;
      monthlyBudgetMicros?: unknown;
      policy?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const bound = await getProjectForWorkspace(
      db,
      body.workspaceId,
      projectId,
    );
    if (!bound) throw new ApiError("not_found", "project not found");

    const action = typeof body.action === "string" ? body.action : "enable";

    if (action === "disable") {
      const project = await disableMaintainerMode(db, {
        workspaceId: body.workspaceId,
        projectId,
        actor: user.id,
      });
      return jsonOk(
        {
          enabled: project.maintainerEnabled,
          policy: parseMaintainerPolicy(project.maintainerPolicyJson),
        },
        { correlationId },
      );
    }

    if (action === "update") {
      const patch =
        body.policy && typeof body.policy === "object"
          ? (body.policy as Record<string, unknown>)
          : {};
      const monthly =
        typeof body.monthlyBudgetMicros === "number"
          ? body.monthlyBudgetMicros
          : typeof patch.monthlyBudgetMicros === "number"
            ? patch.monthlyBudgetMicros
            : undefined;
      const { project, policy } = await updateMaintainerPolicy(db, {
        workspaceId: body.workspaceId,
        projectId,
        actor: user.id,
        patch: {
          ...(monthly !== undefined ? { monthlyBudgetMicros: monthly } : {}),
          ...(typeof patch.autoMerge === "boolean"
            ? { autoMerge: patch.autoMerge }
            : {}),
          ...(typeof patch.autoRelease === "boolean"
            ? { autoRelease: patch.autoRelease }
            : {}),
          ...(typeof patch.selfImprove === "boolean"
            ? { selfImprove: patch.selfImprove }
            : {}),
          ...(typeof patch.communityReplies === "boolean"
            ? { communityReplies: patch.communityReplies }
            : {}),
          enabled: true,
        },
      });
      return jsonOk(
        { enabled: project.maintainerEnabled, policy },
        { correlationId },
      );
    }

    const monthlyBudgetMicros =
      typeof body.monthlyBudgetMicros === "number"
        ? body.monthlyBudgetMicros
        : DEFAULT_MONTHLY_BUDGET_MICROS;

    const { project, policy } = await enableMaintainerMode(db, {
      workspaceId: body.workspaceId,
      projectId,
      actor: user.id,
      policy: { monthlyBudgetMicros },
    });

    return jsonOk(
      { enabled: project.maintainerEnabled, policy },
      { status: 201, correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
