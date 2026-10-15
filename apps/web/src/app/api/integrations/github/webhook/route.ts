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
  ensureDefaultAutoArmRule,
  findWorkspacesForRepo,
  ingestCiEvidence,
  ingestSignal,
  recordWebhookDelivery,
  setInstallationStatusByGithubId,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import {
  CodeqlSignalAdapter,
  DependabotSignalAdapter,
  envelopeFromCiFailure,
  isCiFailureConclusion,
} from "@coppergate/signals";
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

      // TASK088 — CI failure → Signal → optional fix arena (when no matching run).
      if (
        !ingested.attached &&
        evidence.blocksAccept &&
        isCiFailureConclusion(evidence.conclusion) &&
        evidence.repoFullName
      ) {
        const targets = await findWorkspacesForRepo(
          db,
          evidence.repoFullName,
        );
        for (const t of targets) {
          await ensureDefaultAutoArmRule(db, {
            workspaceId: t.workspaceId,
            provider: "ci_failure",
            actor: "system:webhook",
            profileKeys: ["fixer"],
          });
          const envelope = envelopeFromCiFailure({
            provider: "github",
            externalId: `check_run:${evidence.checkRunId ?? headers.deliveryId}`,
            name: evidence.name,
            conclusion: evidence.conclusion,
            headSha: evidence.headSha,
            repoFullName: evidence.repoFullName,
            detailsUrl: evidence.detailsUrl,
          });
          const armed = await ingestSignal(db, {
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            envelope,
            actor: "system:webhook",
          });
          if (armed.armed) {
            note = `${note}; ci_failure armed task ${armed.task?.id}`;
          }
        }
      }
    } else if (headers.event === "check_suite") {
      const evidence = mapCheckSuitePayload(parsed as CheckSuitePayload);
      const ingested = await ingestCiEvidence(db, evidence);
      note = ingested.attached
        ? `check_suite attached to run ${ingested.run?.id}`
        : `check_suite.${action ?? "unknown"} (no matching run)`;
    } else if (
      headers.event === "code_scanning_alert" ||
      headers.event === "dependabot_alert"
    ) {
      const repo = parsed.repository as { full_name?: string } | undefined;
      const repoFullName =
        typeof repo?.full_name === "string" ? repo.full_name : null;
      const provider =
        headers.event === "code_scanning_alert" ? "codeql" : "dependabot";
      const adapter =
        provider === "codeql"
          ? new CodeqlSignalAdapter()
          : new DependabotSignalAdapter();
      const envelope = adapter.normalize({ rawBody });
      if (envelope && repoFullName) {
        const targets = await findWorkspacesForRepo(db, repoFullName);
        let armedCount = 0;
        for (const t of targets) {
          await ensureDefaultAutoArmRule(db, {
            workspaceId: t.workspaceId,
            provider,
            actor: "system:webhook",
            profileKeys:
              provider === "codeql"
                ? ["security", "fixer"]
                : ["security"],
          });
          const armed = await ingestSignal(db, {
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            envelope,
            actor: "system:webhook",
          });
          if (armed.armed) armedCount += 1;
        }
        note = `${provider} signal; armed=${armedCount}`;
      } else {
        note = `${headers.event} ignored (no envelope or repo)`;
      }
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
