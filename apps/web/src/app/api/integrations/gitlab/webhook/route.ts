import { recordWebhookDelivery } from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import {
  parseGitlabWebhookHeaders,
  verifyGitlabWebhookToken,
} from "@coppergate/gitlab";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** GitLab project/group webhooks — verify token, idempotent store. */
export async function POST(request: Request) {
  const correlationId = correlationIdFrom(request);
  try {
    if (!env.GITLAB_WEBHOOK_SECRET) {
      throw new ApiError(
        "not_ready",
        "GITLAB_WEBHOOK_SECRET is not configured",
      );
    }

    const headers = parseGitlabWebhookHeaders(request.headers);
    if (!headers) {
      throw new ApiError("bad_request", "Missing GitLab webhook headers");
    }
    if (
      !verifyGitlabWebhookToken(env.GITLAB_WEBHOOK_SECRET, headers.token)
    ) {
      throw new ApiError("forbidden", "Invalid GitLab webhook token");
    }

    const raw = await request.text();
    let action: string | null = null;
    let projectId: string | null = null;
    try {
      const payload = JSON.parse(raw) as {
        object_attributes?: { action?: string };
        project?: { id?: number };
      };
      action = payload.object_attributes?.action ?? null;
      projectId =
        payload.project?.id != null ? String(payload.project.id) : null;
    } catch {
      /* store raw even if JSON parse fails after token verify */
    }

    const result = await recordWebhookDelivery(db, {
      provider: "gitlab",
      deliveryId: `gitlab:${headers.deliveryId}`,
      event: headers.event,
      action,
      githubInstallationId: projectId,
      payload: raw,
      status: "processed",
    });

    logger.info("gitlab webhook", {
      correlationId,
      event: headers.event,
      kind: result.kind,
      deliveryId: headers.deliveryId,
    });

    return jsonOk(
      { ok: true, duplicate: result.kind === "duplicate" },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
