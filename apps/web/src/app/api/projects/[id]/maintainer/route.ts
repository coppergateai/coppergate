import {
  clearMergeBlockedForProject,
  DEFAULT_MONTHLY_BUDGET_MICROS,
  disableMaintainerMode,
  enableMaintainerMode,
  describeArchitectureFetchFailure,
  fetchArchitectureProgram,
  getMaintainerMetrics,
  getProjectForWorkspace,
  parseArchitectureProgramRows,
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

    if (action === "clear_merge_blocked") {
      const result = await clearMergeBlockedForProject(db, {
        workspaceId: body.workspaceId,
        projectId,
        actor: user.id,
      });
      return jsonOk(
        {
          cleared: result.cleared,
          hint: "Retry merge on the next worker tick after GitHub branch protection / CODEOWNERS allows the Coppergate App to merge.",
        },
        { correlationId },
      );
    }

    if (action === "validate_open_program") {
      const patch =
        body.policy && typeof body.policy === "object"
          ? (body.policy as Record<string, unknown>)
          : {};
      const current = parseMaintainerPolicy(bound.project.maintainerPolicyJson);
      const architectureRepo =
        typeof patch.architectureRepo === "string"
          ? patch.architectureRepo.trim()
          : (current.architectureRepo ?? "");
      const architecturePaths =
        typeof patch.architecturePaths === "string"
          ? patch.architecturePaths.trim()
          : (current.architecturePaths ?? "");
      if (
        !architectureRepo ||
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(architectureRepo)
      ) {
        throw new ApiError(
          "bad_request",
          "architectureRepo must be owner/name",
        );
      }
      if (!architecturePaths) {
        throw new ApiError("bad_request", "architecturePaths required");
      }
      const fetched = await fetchArchitectureProgram({
        repo: architectureRepo,
        paths: architecturePaths,
      });
      if (!fetched.ok) {
        throw new ApiError(
          "bad_request",
          describeArchitectureFetchFailure(fetched),
        );
      }
      const md = fetched.markdown;
      if (!md.trim()) {
        throw new ApiError(
          "bad_request",
          "Could not fetch Open Program markdown (empty). Re-bind Program path and token.",
        );
      }
      const rows = parseArchitectureProgramRows(md);
      const openCount = rows.filter((r) => r.status === "open").length;
      const doneCount = rows.filter((r) => r.status === "done").length;
      if (rows.length === 0) {
        throw new ApiError(
          "bad_request",
          "No Open/Done program IDs parsed from markdown",
        );
      }
      return jsonOk(
        {
          ok: true,
          architectureRepo,
          architecturePaths,
          openCount,
          doneCount,
          sampleIds: rows.slice(0, 8).map((r) => r.id),
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
      const architectureRepo =
        typeof patch.architectureRepo === "string"
          ? patch.architectureRepo.trim() || null
          : undefined;
      const architecturePaths =
        typeof patch.architecturePaths === "string"
          ? patch.architecturePaths.trim() || null
          : undefined;
      if (
        architectureRepo !== undefined &&
        architectureRepo !== null &&
        !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(architectureRepo)
      ) {
        throw new ApiError(
          "bad_request",
          "architectureRepo must be owner/name",
        );
      }
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
          ...(architectureRepo !== undefined ? { architectureRepo } : {}),
          ...(architecturePaths !== undefined ? { architecturePaths } : {}),
          // Preserve current enabled flag unless an explicit boolean is patched.
          enabled:
            typeof patch.enabled === "boolean"
              ? patch.enabled
              : bound.project.maintainerEnabled,
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
