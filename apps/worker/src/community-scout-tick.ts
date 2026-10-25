/**
 * Community scout: open good-first-issue GitHub issues; optionally auto-import.
 */
import {
  fetchArchitectureBacklogMarkdown,
  getProjectSpendSummary,
  importGithubIssueAsTask,
  isCommunityScoutDue,
  listInFlightArchitectureIds,
  listReposForProject,
  parseMaintainerPolicy,
  proposeCommunityIssues,
  recordCommunityScoutEvent,
  submitTaskForApproval,
  type Database,
  type Project,
} from "@coppergate/db";
import {
  countGoodFirstIssues,
  createIssue,
  listOpenIssues,
} from "@coppergate/github";
import type { Logger } from "@coppergate/telemetry";

export async function runCommunityScoutForProject(
  db: Database,
  log: Logger,
  input: {
    workspaceId: string;
    project: Project;
    token: string;
  },
): Promise<{ created: number; skipped: string | null }> {
  const policy = parseMaintainerPolicy(input.project.maintainerPolicyJson);
  if (!policy.communityScout) {
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

  const due = await isCommunityScoutDue(
    db,
    input.project.id,
    policy.communityScoutIntervalHours,
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
    await recordCommunityScoutEvent(db, {
      workspaceId: input.workspaceId,
      projectId: input.project.id,
      payload: { created: [], skipped: "no_repos" },
    });
    return { created: 0, skipped: "no_repos" };
  }

  const markdown = await fetchArchitectureBacklogMarkdown(input.token);
  const excludeIds = await listInFlightArchitectureIds(db, {
    workspaceId: input.workspaceId,
    projectId: input.project.id,
    architectureToken: input.token,
  });
  const created: Array<{
    repo: string;
    number: number;
    htmlUrl: string;
    title: string;
    body: string;
    primary: boolean;
  }> = [];

  // Prefer primary repo for scout creates (sole-dev board).
  const ordered = [...repos].sort((a, b) => {
    const ap = a.repoRole === "primary" ? 0 : 1;
    const bp = b.repoRole === "primary" ? 0 : 1;
    return ap - bp;
  });

  for (const repo of ordered) {
    const [owner, name] = repo.baseRepoFullName.split("/");
    if (!owner || !name) continue;

    let openIssues;
    try {
      openIssues = await listOpenIssues({
        token: input.token,
        owner,
        repo: name,
      });
    } catch (err) {
      log.warn("community scout list issues failed", {
        repo: repo.baseRepoFullName,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    const openGoodFirst = countGoodFirstIssues(openIssues);
    const room = Math.max(
      0,
      policy.communityScoutMaxOpenGoodFirst - openGoodFirst,
    );
    const budgetLeft =
      policy.communityScoutMaxPerRun - created.length;
    const maxForRepo = Math.min(room, budgetLeft);
    if (maxForRepo <= 0) continue;

    const candidates = proposeCommunityIssues({
      openIssues,
      architectureMarkdown: markdown,
      max: maxForRepo,
      excludeIds,
    });

    for (const c of candidates) {
      try {
        const issue = await createIssue({
          token: input.token,
          owner,
          repo: name,
          title: c.title,
          body: c.body,
          labels: ["good first issue", "help wanted"],
        });
        created.push({
          repo: repo.baseRepoFullName,
          number: issue.number,
          htmlUrl: issue.htmlUrl,
          title: issue.title,
          body: c.body,
          primary: repo.repoRole === "primary",
        });
        if (created.length >= policy.communityScoutMaxPerRun) break;
      } catch (err) {
        log.warn("community scout createIssue failed", {
          repo: repo.baseRepoFullName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    if (created.length >= policy.communityScoutMaxPerRun) break;
  }

  const imported: Array<{ issueNumber: number; taskId: string }> = [];
  const importMax = policy.communityScoutAutoImportMax;
  if (importMax > 0) {
    for (const issue of created.filter((c) => c.primary).slice(0, importMax)) {
      try {
        const task = await importGithubIssueAsTask(db, {
          workspaceId: input.workspaceId,
          projectId: input.project.id,
          actor: "system:community-scout",
          issueNumber: issue.number,
          title: issue.title,
          body: issue.body,
        });
        await submitTaskForApproval(db, {
          workspaceId: input.workspaceId,
          taskId: task.id,
          actor: "system:community-scout",
        });
        imported.push({ issueNumber: issue.number, taskId: task.id });
      } catch (err) {
        log.warn("community scout auto-import failed", {
          issueNumber: issue.number,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  await recordCommunityScoutEvent(db, {
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
      intervalHours: policy.communityScoutIntervalHours,
    },
  });

  if (created.length) {
    log.info("community scout created issues", {
      projectId: input.project.id,
      count: created.length,
      imported: imported.length,
      issues: created.map((c) => c.htmlUrl),
    });
  }

  return { created: created.length, skipped: null };
}
