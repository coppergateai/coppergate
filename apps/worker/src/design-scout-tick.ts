/**
 * Design scout: screenshot target URLs → open design/ux GitHub issues.
 */
import {
  getProjectSpendSummary,
  importGithubIssueAsTask,
  isDesignScoutDue,
  listReposForProject,
  parseMaintainerPolicy,
  proposeDesignIssues,
  recordDesignScoutEvent,
  resolveDesignScoutRoutes,
  submitTaskForApproval,
  type Database,
  type Project,
} from "@coppergate/db";
import {
  createIssue,
  listOpenIssues,
  putRepoBinaryFile,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";
import { captureDesignScoutShots } from "./design-scout-capture.js";

const DEFAULT_BASE_URL = "https://www.coppergate.ai";

export async function runDesignScoutForProject(
  db: Database,
  log: Logger,
  input: {
    workspaceId: string;
    project: Project;
    token: string;
  },
): Promise<{ created: number; skipped: string | null }> {
  const policy = parseMaintainerPolicy(input.project.maintainerPolicyJson);
  if (!policy.designScout) {
    return { created: 0, skipped: "disabled" };
  }

  try {
    const spend = await getProjectSpendSummary(
      db,
      input.workspaceId,
      input.project.id,
    );
    if (spend.budgetStatus === "paused" || spend.availableMicros <= 0) {
      return { created: 0, skipped: "budget" };
    }
  } catch {
    return { created: 0, skipped: "budget_error" };
  }

  const due = await isDesignScoutDue(
    db,
    input.project.id,
    policy.designScoutIntervalHours,
  );
  if (!due) {
    return { created: 0, skipped: "not_due" };
  }

  const repos = await listReposForProject(
    db,
    input.workspaceId,
    input.project.id,
  );
  if (repos.length === 0) {
    await recordDesignScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: { created: [], skipped: "no_repos" },
    });
    return { created: 0, skipped: "no_repos" };
  }

  const primary =
    [...repos].sort((a, b) => {
      const ap = a.repoRole === "primary" ? 0 : 1;
      const bp = b.repoRole === "primary" ? 0 : 1;
      return ap - bp;
    })[0]!;
  const [owner, name] = primary.baseRepoFullName.split("/");
  if (!owner || !name) {
    return { created: 0, skipped: "bad_repo" };
  }

  const baseUrl = policy.designScoutBaseUrl ?? DEFAULT_BASE_URL;
  const hasAuth = Boolean(process.env.DESIGN_SCOUT_STORAGE_STATE?.trim());
  const workspaceIdForRoutes =
    process.env.DESIGN_SCOUT_WORKSPACE_ID?.trim() || input.workspaceId;
  const routes = resolveDesignScoutRoutes({
    hasAuth,
    workspaceId: workspaceIdForRoutes,
  });

  const capture = await captureDesignScoutShots({ baseUrl, routes });
  if (!capture.ok) {
    await recordDesignScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: {
        created: [],
        skipped: capture.reason,
        error: capture.error ?? null,
      },
    });
    log.warn("design scout capture skipped", {
      projectId: input.project.id,
      reason: capture.reason,
      error: capture.error,
    });
    return { created: 0, skipped: capture.reason };
  }

  const runId = crypto.randomUUID().slice(0, 8);
  const imageMarkdownByShot: Record<string, string> = {};

  for (const shot of capture.shots) {
    if (!shot.pngBytes || shot.pngBytes.byteLength === 0) continue;
    if (
      !shot.metrics.hScroll &&
      shot.metrics.overflowRight.length === 0 &&
      shot.metrics.scrollW <= shot.metrics.client + 1
    ) {
      continue;
    }
    const repoPath = `.coppergate/design-scout/${runId}/${shot.name}.png`;
    try {
      await putRepoBinaryFile({
        token: input.token,
        owner,
        repo: name,
        path: repoPath,
        content: shot.pngBytes,
        message: `chore(design-scout): capture ${shot.name} (${runId})`,
        defaultBranch: primary.defaultBranch,
        allowDefaultBranchWrite: policy.designScout === true,
      });
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${name}/HEAD/${repoPath}`;
      imageMarkdownByShot[shot.name] = `![${shot.name}](${rawUrl})`;
    } catch (err) {
      log.warn("design scout png upload failed", {
        shot: shot.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let openIssues;
  try {
    openIssues = await listOpenIssues({
      token: input.token,
      owner,
      repo: name,
    });
  } catch (err) {
    log.warn("design scout list issues failed", {
      repo: primary.baseRepoFullName,
      error: err instanceof Error ? err.message : String(err),
    });
    await recordDesignScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: { created: [], skipped: "list_issues_failed" },
    });
    return { created: 0, skipped: "list_issues_failed" };
  }

  const candidates = proposeDesignIssues({
    shots: capture.shots,
    openIssues,
    max: policy.designScoutMaxPerRun,
    runId,
    imageMarkdownByShot,
  });

  const created: Array<{
    repo: string;
    number: number;
    htmlUrl: string;
    title: string;
    body: string;
    primary: boolean;
  }> = [];

  for (const c of candidates) {
    try {
      const issue = await createIssue({
        token: input.token,
        owner,
        repo: name,
        title: c.title,
        body: c.body,
        labels: ["design", "ux"],
      });
      created.push({
        repo: primary.baseRepoFullName,
        number: issue.number,
        htmlUrl: issue.htmlUrl,
        title: issue.title,
        body: c.body,
        primary: true,
      });
    } catch (err) {
      log.warn("design scout createIssue failed", {
        repo: primary.baseRepoFullName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const imported: Array<{ issueNumber: number; taskId: string }> = [];
  const importMax = policy.designScoutAutoImportMax;
  if (importMax > 0) {
    for (const issue of created.slice(0, importMax)) {
      try {
        const task = await importGithubIssueAsTask(db, {
          workspaceId: input.workspaceId,
          projectId: input.project.id,
          actor: "system:design-scout",
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body,
        });
        await submitTaskForApproval(db, {
          workspaceId: input.workspaceId,
          taskId: task.id,
          actor: "system:design-scout",
        });
        imported.push({ issueNumber: issue.number, taskId: task.id });
      } catch (err) {
        log.warn("design scout auto-import failed", {
          issueNumber: issue.number,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await recordDesignScoutEvent(db, {
    workspaceId: input.workspaceId,
    projectId: input.project.id,
    payload: {
      created: created.map(({ repo, number, htmlUrl, title }) => ({
        repo,
        number,
        htmlUrl,
        title,
      })),
      imported,
      shots: capture.shots.length,
      skippedAuthRoutes: capture.skippedAuthRoutes,
      baseUrl,
      intervalHours: policy.designScoutIntervalHours,
      runId,
    },
  });

  if (created.length) {
    log.info("design scout created issues", {
      projectId: input.project.id,
      count: created.length,
      imported: imported.length,
      issues: created.map((c) => c.htmlUrl),
    });
  }

  return { created: created.length, skipped: null };
}
