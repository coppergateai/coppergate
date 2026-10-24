import {
  SIGNAL_INGEST_LIMITS,
  SignalError,
  countRecentSignalIngests,
  countRecentSignalIngestsByProvider,
  ensureDefaultAutoArmRule,
  evaluateIngestQuota,
  getActiveWorkspaceById,
  ingestSignal,
  ingestSonarFitness,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import {
  getSignalAdapter,
  resolveWorkspaceSignalSecret,
} from "@coppergate/signals";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; provider: string }>;
};

const RATE_WINDOW_MS = 60_000;

/**
 * Provider webhook ingress (TASK063) — workspace-scoped.
 * Auth: X-Coppergate-Signal-Secret must match the workspace-derived secret
 * (HMAC of SIGNAL_WEBHOOK_SECRET / SIGNAL_<PROVIDER>_SECRET + workspaceId).
 */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const { id: workspaceId, provider } = await context.params;
    const adapter = getSignalAdapter(provider);
    if (!adapter) {
      throw new ApiError("not_found", `Unknown signal provider: ${provider}`);
    }

    const workspace = await getActiveWorkspaceById(db, workspaceId);
    if (!workspace) {
      throw new ApiError("not_found", "Workspace not found");
    }

    const rootSecret =
      process.env.SIGNAL_WEBHOOK_SECRET ?? env.SIGNAL_WEBHOOK_SECRET ?? null;
    const providerSecret =
      process.env[`SIGNAL_${provider.toUpperCase()}_SECRET`] ?? null;
    const secret = resolveWorkspaceSignalSecret({
      workspaceId,
      rootSecret,
      providerSecret,
    });

    const rawBody = await request.text();
    const verified = adapter.verify({
      rawBody,
      headers: request.headers,
      secret,
    });
    if (!verified.ok) {
      throw new ApiError("unauthorized", verified.reason);
    }

    const [workspaceCount, providerCount] = await Promise.all([
      countRecentSignalIngests(db, workspaceId, RATE_WINDOW_MS),
      countRecentSignalIngestsByProvider(
        db,
        workspaceId,
        provider,
        RATE_WINDOW_MS,
      ),
    ]);
    const quota = evaluateIngestQuota({
      workspaceCount,
      providerCount,
      workspaceLimit: SIGNAL_INGEST_LIMITS.workspacePerMinute,
      providerLimit: SIGNAL_INGEST_LIMITS.providerPerMinute,
    });
    if (!quota.ok) {
      throw new ApiError(
        "bad_request",
        quota.reason === "provider_storm"
          ? "Signal provider storm shed"
          : "Signal ingest rate limit exceeded",
        { status: 429 },
      );
    }

    const envelope = adapter.normalize({
      rawBody,
      headers: request.headers,
    });
    if (!envelope) {
      throw new ApiError("bad_request", "Could not normalize webhook payload");
    }

    await ensureDefaultAutoArmRule(db, {
      workspaceId,
      provider: envelope.provider,
      actor: "system:webhook",
      profileKeys:
        provider === "sonar"
          ? ["fixer", "security"]
          : provider === "ci_failure"
            ? ["fixer"]
            : ["fixer"],
    });

    const result = await ingestSignal(db, {
      workspaceId,
      envelope,
      actor: "system:webhook",
    });

    // Sonar fitness path: if payload has headSha + gate status, attach to run.
    if (provider === "sonar" && !result.duplicate) {
      try {
        const parsed = JSON.parse(rawBody) as Record<string, unknown>;
        const gate =
          (parsed.qualityGate as { status?: string } | undefined)?.status ??
          (typeof parsed.gateStatus === "string" ? parsed.gateStatus : null);
        const headSha =
          typeof parsed.headSha === "string"
            ? parsed.headSha
            : typeof parsed.revision === "string"
              ? parsed.revision
              : null;
        if (gate && headSha) {
          await ingestSonarFitness(db, {
            headSha,
            gateStatus: gate,
            projectKey:
              typeof parsed.projectKey === "string"
                ? parsed.projectKey
                : null,
          });
        }
      } catch {
        /* fitness attach is best-effort */
      }
    }

    logger.info("signal webhook processed", {
      correlationId,
      workspaceId,
      provider,
      signalId: result.event.id,
      duplicate: result.duplicate,
      armed: result.armed,
    });

    return jsonOk(
      {
        ok: true,
        duplicate: result.duplicate,
        armed: result.armed,
        signalId: result.event.id,
        taskId: result.task?.id ?? null,
      },
      { correlationId },
    );
  } catch (err) {
    if (err instanceof SignalError) {
      return jsonError(
        new ApiError("bad_request", err.message),
        correlationId,
      );
    }
    return jsonError(err, correlationId);
  }
}
