import {
  handleCheckRunEventStub,
  handleInstallationEventStub,
  installationStatusFromAction,
  mapCheckRunPayload,
  mapCheckSuitePayload,
  parseGithubWebhookHeaders,
  verifyGithubWebhookSignature,
  type CheckRunWebhookPayload,
  type CheckSuitePayload,
  type InstallationWebhookPayload,
} from "@coppergate/github";
import {
  ingestCiEvidence,
  recordWebhookDelivery,
  setInstallationStatusByGithubId,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GitHub App webhook ingress — signature required; delivery_id is idempotent.
 */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    // Read at request time so tests/CI can inject without module-cache races.
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new ApiError(
        "not_ready",
        "GitHub webhook secret is not configured (GITHUB_WEBHOOK_SECRET)",
      );
    }

    const headers = parseGithubWebhookHeaders(request.headers);
    if (!headers) {
      throw new ApiError(
        "unauthorized",
        "Missing GitHub webhook signature headers",
      );
    }

    const rawBody = await request.text();
    if (
      !verifyGithubWebhookSignature(rawBody, headers.signature, secret)
    ) {
      throw new ApiError("unauthorized", "Invalid GitHub webhook signature");
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      throw new ApiError("bad_request", "Invalid JSON payload");
    }

    const action =
      typeof parsed.action === "string" ? parsed.action : null;
    const installationObj = parsed.installation as
      | { id?: number }
      | undefined;
    const githubInstallationId =
      installationObj?.id != null ? String(installationObj.id) : null;

    const recorded = await recordWebhookDelivery(db, {
      deliveryId: headers.deliveryId,
      event: headers.event,
      action,
      githubInstallationId,
      payload: rawBody,
    });

    if (recorded.kind === "duplicate") {
      logger.info("webhook duplicate ignored", {
        correlationId,
        deliveryId: headers.deliveryId,
        event: headers.event,
      });
      return jsonOk(
        { ok: true, duplicate: true },
        { correlationId },
      );
    }

    let note = `unhandled event ${headers.event}`;
    if (headers.event === "ping") {
      note = "ping";
    } else if (headers.event === "installation") {
      const stub = handleInstallationEventStub(
        parsed as InstallationWebhookPayload,
      );
      note = stub.note;
      const status = installationStatusFromAction(action ?? undefined);
      if (status && githubInstallationId) {
        await setInstallationStatusByGithubId(
          db,
          githubInstallationId,
          status,
        );
      }
    } else if (headers.event === "check_run") {
      const stub = handleCheckRunEventStub(parsed as CheckRunWebhookPayload);
      const evidence = mapCheckRunPayload(parsed as CheckRunWebhookPayload);
      const ingested = await ingestCiEvidence(db, evidence);
      note = ingested.attached
        ? `${stub.note}; attached to run ${ingested.run?.id}`
        : stub.note;
    } else if (headers.event === "check_suite") {
      const evidence = mapCheckSuitePayload(parsed as CheckSuitePayload);
      const ingested = await ingestCiEvidence(db, evidence);
      note = ingested.attached
        ? `check_suite attached to run ${ingested.run?.id}`
        : `check_suite.${action ?? "unknown"} (no matching run)`;
    }

    logger.info("webhook processed", {
      correlationId,
      deliveryId: headers.deliveryId,
      event: headers.event,
      action,
      note,
    });

    return jsonOk({ ok: true, note }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
