import {
  handleCheckRunEventStub,
  handleInstallationEventStub,
  installationStatusFromAction,
  mapCheckRunPayload,
  mapCheckSuitePayload,
  mapCommitStatusPayload,
  isVercelCommitStatusContext,
  parseGithubWebhookHeaders,
  verifyGithubWebhookSignature,
  type CheckRunWebhookPayload,
  type CheckSuitePayload,
  type InstallationWebhookPayload,
} from "@coppergate/github";
import {
  ensureDefaultAutoArmRule,
  evaluateCiFlakeCooldown,
  findWorkspacesForRepo,
  ingestCiEvidence,
  ingestSignal,
  recordCiCheckObservation,
  recordWebhookDelivery,
  resolveWaitingCiRunsForPr,
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

/** Attach CI evidence only to runs in workspaces that own the repo (tenant-scoped). */
async function ingestCiEvidenceScoped(
  evidence: ReturnType<typeof mapCheckRunPayload>,
): Promise<{ attached: boolean; runId: string | null }> {
  if (!evidence.repoFullName) {
    return { attached: false, runId: null };
  }
  const targets = await findWorkspacesForRepo(db, evidence.repoFullName);
  const seen = new Set<string>();
  let attached = false;
  let runId: string | null = null;
  for (const t of targets) {
    if (seen.has(t.workspaceId)) continue;
    seen.add(t.workspaceId);
    const ingested = await ingestCiEvidence(db, {
      ...evidence,
      workspaceId: t.workspaceId,
    });
    if (ingested.attached) {
      attached = true;
      runId = ingested.run?.id ?? runId;
    }
  }
  return { attached, runId };
}

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
      const ingested = await ingestCiEvidenceScoped(evidence);
      note = ingested.attached
        ? `${stub.note}; attached to run ${ingested.runId}`
        : stub.note;

      // AG-021 — record check outcomes (pass + fail) for flake cooldown history.
      if (evidence.repoFullName && evidence.name) {
        const obsTargets = await findWorkspacesForRepo(
          db,
          evidence.repoFullName,
        );
        for (const t of obsTargets) {
          await recordCiCheckObservation(db, {
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            name: evidence.name,
            conclusion: evidence.conclusion,
            passed: evidence.passed,
            repoFullName: evidence.repoFullName,
            headSha: evidence.headSha,
          }).catch(() => undefined);
        }
      }

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
          // AG-021 — do not thrash Retry/arm while check is oscillating.
          const cool = await evaluateCiFlakeCooldown(db, {
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            checkName: evidence.name,
          });
          if (cool.suppress) {
            note = `${note}; flake_cooldown skipped arm (${cool.reason ?? evidence.name})`;
            continue;
          }
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
      const ingested = await ingestCiEvidenceScoped(evidence);
      note = ingested.attached
        ? `check_suite attached to run ${ingested.runId}`
        : `check_suite.${action ?? "unknown"} (no matching run)`;
    } else if (headers.event === "status") {
      const evidence = mapCommitStatusPayload(
        parsed as {
          state?: string;
          context?: string;
          target_url?: string | null;
          sha?: string;
          repository?: { full_name?: string };
        },
      );
      const ingested = await ingestCiEvidenceScoped(evidence);
      note = ingested.attached
        ? `status attached to run ${ingested.runId}`
        : `status.${evidence.conclusion ?? evidence.status} (no matching run)`;

      // Deploy-fail reverse path — Vercel classic commit status (no matching run).
      // Redeploy happens via Accept → merge → Vercel Git integration (not L3 API).
      if (evidence.repoFullName && evidence.name) {
        const obsTargets = await findWorkspacesForRepo(
          db,
          evidence.repoFullName,
        );
        for (const t of obsTargets) {
          await recordCiCheckObservation(db, {
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            name: evidence.name,
            conclusion: evidence.conclusion,
            passed: evidence.passed,
            repoFullName: evidence.repoFullName,
            headSha: evidence.headSha,
          }).catch(() => undefined);
        }
      }

      if (
        !ingested.attached &&
        evidence.blocksAccept &&
        isCiFailureConclusion(evidence.conclusion) &&
        evidence.repoFullName &&
        isVercelCommitStatusContext(evidence.name)
      ) {
        const targets = await findWorkspacesForRepo(
          db,
          evidence.repoFullName,
        );
        for (const t of targets) {
          const cool = await evaluateCiFlakeCooldown(db, {
            workspaceId: t.workspaceId,
            projectId: t.projectId,
            checkName: evidence.name,
          });
          if (cool.suppress) {
            note = `${note}; flake_cooldown skipped arm (${cool.reason ?? evidence.name})`;
            continue;
          }
          await ensureDefaultAutoArmRule(db, {
            workspaceId: t.workspaceId,
            provider: "ci_failure",
            actor: "system:webhook",
            profileKeys: ["fixer", "engineer"],
          });
          const envelope = envelopeFromCiFailure({
            provider: "vercel",
            externalId: `status:${evidence.name}:${evidence.headSha ?? headers.deliveryId}`,
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
    } else if (headers.event === "pull_request" && action === "closed") {
      const pr = parsed.pull_request as
        | { number?: number; merged?: boolean }
        | undefined;
      const repo = parsed.repository as { full_name?: string } | undefined;
      const prNumber = typeof pr?.number === "number" ? pr.number : null;
      const repoFullName =
        typeof repo?.full_name === "string" ? repo.full_name : null;
      if (prNumber != null && repoFullName) {
        const targets = await findWorkspacesForRepo(db, repoFullName);
        const seen = new Set<string>();
        let resolved = 0;
        for (const t of targets) {
          if (seen.has(t.workspaceId)) continue;
          seen.add(t.workspaceId);
          resolved += await resolveWaitingCiRunsForPr(db, {
            workspaceId: t.workspaceId,
            prNumber,
            outcome: pr?.merged === true ? "merged" : "closed_unmerged",
            actor: "system:webhook",
          });
        }
        note = `pull_request.closed resolved=${resolved} pr=${prNumber}`;
      } else {
        note = "pull_request.closed ignored (no pr/repo)";
      }
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
