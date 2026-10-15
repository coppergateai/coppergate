import {
  SIGNAL_INGEST_LIMITS,
  SignalError,
  countRecentSignalIngests,
  ensureDefaultAutoArmRule,
  evaluateIngestQuota,
  ingestSignal,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { FakeSignalAdapter, getSignalAdapter } from "@coppergate/signals";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const RATE_WINDOW_MS = 60_000;

/**
 * Owner test ingest — Fake or provider envelope without external webhook (TASK063).
 */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const recent = await countRecentSignalIngests(
      db,
      workspaceId,
      RATE_WINDOW_MS,
    );
    const quota = evaluateIngestQuota({
      workspaceCount: recent,
      providerCount: 0,
      workspaceLimit: SIGNAL_INGEST_LIMITS.workspacePerMinute,
    });
    if (!quota.ok) {
      throw new ApiError("bad_request", "Signal ingest rate limit exceeded", {
        status: 429,
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const provider =
      typeof body.provider === "string" ? body.provider : "fake";
    const adapter = getSignalAdapter(provider) ?? new FakeSignalAdapter();
    const rawBody = JSON.stringify(body);
    const envelope = adapter.normalize({ rawBody });
    if (!envelope) {
      throw new ApiError("bad_request", "Could not normalize signal payload");
    }

    await ensureDefaultAutoArmRule(db, {
      workspaceId,
      provider: envelope.provider,
      actor: `user:${user.id}`,
      profileKeys:
        envelope.provider === "sonar"
          ? ["fixer", "security"]
          : envelope.provider === "ci_failure"
            ? ["fixer"]
            : ["fixer"],
    });

    const result = await ingestSignal(db, {
      workspaceId,
      envelope,
      actor: `user:${user.id}`,
      projectId:
        typeof body.projectId === "string" ? body.projectId : null,
      skipAutoArm: body.skipAutoArm === true,
    });

    return jsonOk(
      {
        event: result.event,
        duplicate: result.duplicate,
        armed: result.armed,
        taskId: result.task?.id ?? null,
      },
      { correlationId, status: result.duplicate ? 200 : 201 },
    );
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
