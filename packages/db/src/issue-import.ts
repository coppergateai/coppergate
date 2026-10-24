import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  approveBrief,
  createBriefDraft,
  getLatestBriefForProject,
  recordAuditEvent,
} from "./briefs.js";
import {
  milestones,
  projects,
  repositoryConnections,
  tasks,
  type Task,
} from "./schema.js";

export class IssueImportError extends Error {
  readonly code: "not_found" | "invalid" | "conflict";
  constructor(code: IssueImportError["code"], message: string) {
    super(message);
    this.name = "IssueImportError";
    this.code = code;
  }
}

/**
 * Existing-repo wedge: Import → queue must not stall on brief ceremony.
 * Seeds a minimal approved vision when none exists (same pattern as maintainer boot).
 */
async function ensureBriefForIssueImport(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    projectName: string;
    mode: string;
  },
): Promise<string> {
  const latest = await getLatestBriefForProject(
    db,
    input.workspaceId,
    input.projectId,
  );
  if (latest?.status === "approved") return latest.id;

  const [project] = await db
    .select({ currentBriefId: projects.currentBriefId })
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (project?.currentBriefId) return project.currentBriefId;

  if (latest) return latest.id;

  // new_product keeps the explicit brief path; only auto-seed for existing_repo.
  if (input.mode !== "existing_repo") {
    throw new IssueImportError(
      "invalid",
      "Approve a product brief before importing issues",
    );
  }

  let repoLabel = input.projectName;
  const [repo] = await db
    .select({ fullName: repositoryConnections.baseRepoFullName })
    .from(repositoryConnections)
    .where(
      and(
        eq(repositoryConnections.projectId, input.projectId),
        eq(repositoryConnections.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (repo?.fullName) repoLabel = repo.fullName;

  const draft = await createBriefDraft(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    rawIdea: `Issue → verified PR loop for ${repoLabel}`,
    content: {
      title: `${input.projectName} — issue delivery`,
      targetUser: "Repository maintainers",
      problem: `Ship scoped GitHub issues on ${repoLabel} as verified PRs under a spend cap.`,
      scope:
        "Import open issues, run contenders in Arena, accept when CI and policy pass.",
      nonGoals:
        "Unbounded refactors, multi-repo ships without policy, skipping human Accept on irreversible merges.",
      acceptanceCriteria: [
        "Imported issue becomes a task with clear acceptance criteria",
        "Survivor PR opens with an issue link",
        "Accept only when hard gates (CI/policy) pass",
      ],
      clarifyingAnswers: [],
    },
  });
  const approved = await approveBrief(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    briefId: draft.id,
    actor: input.actor,
  });
  return approved.id;
}

/**
 * TASK040 — create a DRAFT task from a GitHub issue (skips full plan generate).
 */
export async function importGithubIssueAsTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    issueNumber: number;
    title: string;
    body?: string | null;
  },
): Promise<Task> {
  if (!Number.isInteger(input.issueNumber) || input.issueNumber < 1) {
    throw new IssueImportError("invalid", "issueNumber must be a positive integer");
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, input.projectId),
        eq(projects.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!project) throw new IssueImportError("not_found", "project not found");

  const existing = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.githubIssueNumber, input.issueNumber),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new IssueImportError(
      "conflict",
      `issue #${input.issueNumber} already imported as task`,
    );
  }

  const briefId = await ensureBriefForIssueImport(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    actor: input.actor,
    projectName: project.name,
    mode: project.mode,
  });

  let [milestone] = await db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, input.projectId))
    .orderBy(desc(milestones.createdAt))
    .limit(1);

  if (!milestone) {
    const now = new Date();
    const [created] = await db
      .insert(milestones)
      .values({
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        briefId,
        title: "Issue imports",
        description: "Tasks imported from GitHub issues",
        sequence: 999,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    milestone = created!;
  }

  const now = new Date();
  const body = (input.body ?? "").trim();
  const [task] = await db
    .insert(tasks)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      milestoneId: milestone.id,
      briefId,
      title: input.title.slice(0, 200),
      goal: body || input.title,
      scope: `Imported from GitHub issue #${input.issueNumber}`,
      allowedPaths: JSON.stringify(["**/*"]),
      acceptanceCriteria: JSON.stringify([
        `Addresses GitHub issue #${input.issueNumber}`,
        "PR opens successfully with issue link",
      ]),
      estimateMicros: 50_000,
      estimateComplexity: "S",
      status: "DRAFT",
      githubIssueNumber: input.issueNumber,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "task.import_issue",
    targetType: "task",
    targetId: task!.id,
    meta: { issueNumber: input.issueNumber },
  });

  return task!;
}
