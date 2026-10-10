import { BudgetError, createTaskRun, listRunsForTask } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { mapRunError, serializeRun } from "@/lib/run";
import {
  requireWorkspaceMember,
  requireWorkspaceOwner,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** List runs for a task (newest first). */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ApiError("bad_request", "workspaceId is required");
    }

    await requireWorkspaceMember(db, workspaceId, user.id);
    const runs = await listRunsForTask(db, workspaceId, taskId);
    return jsonOk({ runs: runs.map(serializeRun) }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

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

/** Enqueue a run for an approved (QUEUED) task. Idempotent on idempotencyKey. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      idempotencyKey?: unknown;
      baseSha?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.idempotencyKey !== "string") {
      throw new ApiError("bad_request", "idempotencyKey is required");
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const result = await createTaskRun(db, {
      workspaceId: body.workspaceId,
      taskId,
      idempotencyKey: body.idempotencyKey,
      actor: user.id,
      baseSha: typeof body.baseSha === "string" ? body.baseSha : undefined,
    })
      .catch(mapRunError)
      .catch(mapBudgetError);

    logger.info("task run enqueue", {
      correlationId,
      taskId,
      runId: result.run.id,
      created: result.created,
    });

    return jsonOk(
      {
        run: serializeRun(result.run),
        created: result.created,
      },
      { correlationId, status: result.created ? 201 : 200 },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
