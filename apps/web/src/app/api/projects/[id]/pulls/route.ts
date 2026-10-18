import {
  applySpawnProfilesToArena,
  approveTask,
  getInstallationForWorkspace,
  getProjectForWorkspace,
  importGithubPrAsTask,
  PrImportError,
  submitTaskForApproval,
} from "@coppergate/db";
import { listOpenPulls } from "@coppergate/github";
import { ApiError } from "@coppergate/errors";
import { requireUser } from "@/lib/auth";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { resolveInstallationToken } from "@/lib/github-app";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { mapTaskTransitionError, serializeTask } from "@/lib/task";
import { trackFunnel } from "@/lib/funnel";
import { requireWorkspaceMember, requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function resolveRepoContext(workspaceId: string, projectId: string) {
  const bound = await getProjectForWorkspace(db, workspaceId, projectId);
  if (!bound) throw new ApiError("not_found", "project not found");
  const installation = await getInstallationForWorkspace(db, workspaceId);
  if (!installation) {
    throw new ApiError("bad_request", "GitHub App not installed");
  }
  const fullName = bound.repository.baseRepoFullName;
  const [owner, name] = fullName.split("/");
  if (!owner || !name) {
    throw new ApiError("bad_request", "Invalid repo full name");
  }
  const token = await resolveInstallationToken(db, installation);
  return { project: bound.project, token, owner, name, fullName };
}

/** GET open pull requests for the project's connected repo. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");
    if (!workspaceId) throw new ApiError("bad_request", "workspaceId required");
    await requireWorkspaceMember(db, workspaceId, user.id);
    const ctx = await resolveRepoContext(workspaceId, projectId);
    const pulls = await listOpenPulls({
      token: ctx.token,
      owner: ctx.owner,
      repo: ctx.name,
    });
    return jsonOk({ pulls, repo: ctx.fullName }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

/** POST import PR → DRAFT review task (optional queue: submit + approve). */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: projectId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      workspaceId?: unknown;
      prNumber?: unknown;
      queue?: unknown;
    } | null;
    if (!body || typeof body.workspaceId !== "string") {
      throw new ApiError("bad_request", "workspaceId required");
    }
    if (typeof body.prNumber !== "number") {
      throw new ApiError("bad_request", "prNumber required");
    }
    await requireWorkspaceOwner(db, body.workspaceId, user.id);
    const ctx = await resolveRepoContext(body.workspaceId, projectId);
    const pulls = await listOpenPulls({
      token: ctx.token,
      owner: ctx.owner,
      repo: ctx.name,
    });
    const pull = pulls.find((p) => p.number === body.prNumber);
    if (!pull) throw new ApiError("not_found", "pull request not found or not open");
    let task = await importGithubPrAsTask(db, {
      workspaceId: body.workspaceId,
      projectId,
      actor: user.id,
      prNumber: pull.number,
      title: pull.title,
      body: pull.body,
    });
    trackFunnel({
      stage: "issue_imported",
      workspaceId: body.workspaceId,
      projectId,
      taskId: task.id,
      userId: user.id,
      meta: { prNumber: pull.number, kind: "pr_review", correlationId },
    });

    if (body.queue === true) {
      await applySpawnProfilesToArena(db, {
        workspaceId: body.workspaceId,
        projectId,
        actor: user.id,
        profileKeys: ["security", "qa"],
      }).catch(() => undefined);

      const submitted = await submitTaskForApproval(db, {
        workspaceId: body.workspaceId,
        taskId: task.id,
        actor: user.id,
      }).catch(mapTaskTransitionError);
      task = submitted.task;
      if (task.status === "READY_FOR_APPROVAL") {
        const approved = await approveTask(db, {
          workspaceId: body.workspaceId,
          taskId: task.id,
          actor: user.id,
        }).catch(mapTaskTransitionError);
        task = approved.task;
      }
      if (task.status === "QUEUED" || task.status === "RUNNING") {
        trackFunnel({
          stage: "task_started",
          workspaceId: body.workspaceId,
          projectId,
          taskId: task.id,
          userId: user.id,
          meta: { status: task.status, from: "pr_import_queue" },
        });
      }
    }

    return jsonOk({ task: serializeTask(task) }, { correlationId });
  } catch (err) {
    if (err instanceof PrImportError) {
      const status =
        err.code === "not_found"
          ? "not_found"
          : err.code === "conflict"
            ? "conflict"
            : "bad_request";
      return jsonError(new ApiError(status, err.message), correlationId);
    }
    return jsonError(err, correlationId);
  }
}
