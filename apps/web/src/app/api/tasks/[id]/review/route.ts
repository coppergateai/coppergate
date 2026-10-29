import {
  countAcceptedPrsForWorkspace,
  decideTaskReview,
  getInstallationForWorkspace,
  getProjectForWorkspace,
  listRunsForTask,
  recordAuditEvent,
  type ReviewDecision,
} from "@coppergate/db";
import { mergePullRequest } from "@coppergate/github";
import { resolveDefaultBranchMergeFlag } from "@coppergate/scm";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { trackFunnel } from "@/lib/funnel";
import { resolveInstallationToken } from "@/lib/github-app";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import {
  mapTaskTransitionError,
  serializeTask,
  serializeTransition,
} from "@/lib/task";
import { requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const DECISIONS = new Set<ReviewDecision>([
  "accept",
  "reject",
  "request_changes",
]);

/** Human review: accept → DONE, reject → FAILED, request_changes → NEEDS_REPLAN. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: taskId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      decision?: unknown;
      note?: unknown;
    } | null;

    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId is required");
    }
    if (typeof body.decision !== "string" || !DECISIONS.has(body.decision as ReviewDecision)) {
      throw new ApiError(
        "bad_request",
        "decision must be accept | reject | request_changes",
      );
    }

    await requireWorkspaceOwner(db, body.workspaceId, user.id);

    const result = await decideTaskReview(db, {
      workspaceId: body.workspaceId,
      taskId,
      actor: user.id,
      decision: body.decision as ReviewDecision,
      note: typeof body.note === "string" ? body.note : undefined,
    }).catch(mapTaskTransitionError);

    logger.info("task review decision", {
      correlationId,
      taskId,
      decision: body.decision,
      status: result.task.status,
    });
    const merge: { attempted: boolean; merged: boolean; message: string | null } =
      { attempted: false, merged: false, message: null };

    if (body.decision === "accept") {
      trackFunnel({
        stage: "pr_accepted",
        workspaceId: body.workspaceId,
        projectId: result.task.projectId,
        taskId,
        userId: user.id,
        meta: { status: result.task.status },
      });
      const acceptedCount = await countAcceptedPrsForWorkspace(
        db,
        body.workspaceId,
      );
      if (acceptedCount >= 2) {
        trackFunnel({
          stage: "second_pr_accepted",
          workspaceId: body.workspaceId,
          projectId: result.task.projectId,
          taskId,
          userId: user.id,
          meta: { acceptedCount },
        });
      }

      // TASK043 — optional L2 merge when project.mergeEnabled + autonomy L2.
      try {
        const bound = await getProjectForWorkspace(
          db,
          body.workspaceId,
          result.task.projectId,
        );
        if (
          bound?.project.mergeEnabled &&
          bound.project.autonomyLevel === "L2" &&
          // Review-import tasks target an existing PR — never auto-merge it.
          result.task.githubPrNumber == null
        ) {
          const runs = await listRunsForTask(
            db,
            body.workspaceId,
            taskId,
          );
          const latest = runs[0];
          const prNumber = latest?.prNumber;
          const installation = await getInstallationForWorkspace(
            db,
            body.workspaceId,
          );
          if (prNumber && installation) {
            const [owner, name] =
              bound.repository.baseRepoFullName.split("/");
            if (owner && name) {
              const token = await resolveInstallationToken(db, installation);
              merge.attempted = true;
              const merged = await mergePullRequest({
                token,
                owner,
                repo: name,
                prNumber,
                allowDefaultBranchWrite: resolveDefaultBranchMergeFlag({
                  mergeEnabled: bound.project.mergeEnabled,
                  via: "accept",
                  autonomyLevel: bound.project.autonomyLevel,
                }),
              });
              merge.merged = merged.merged;
              merge.message = merged.message;
              await recordAuditEvent(db, {
                workspaceId: body.workspaceId,
                actor: user.id,
                action: "merge.attempt",
                targetType: "merge",
                targetId: taskId,
                meta: {
                  prNumber,
                  merged: merged.merged,
                  message: merged.message,
                  sha: merged.sha,
                },
              });
            }
          }
        }
      } catch (err) {
        logger.warn("optional L2 merge skipped", {
          correlationId,
          error: err instanceof Error ? err.message : String(err),
        });
        merge.message =
          err instanceof Error ? err.message : "merge attempt failed";
      }
    }

    return jsonOk(
      {
        task: serializeTask(result.task),
        transition: serializeTransition(result.transition),
        decision: body.decision,
        merge,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
