import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  milestones,
  productBriefs,
  projects,
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

  let briefId = project.currentBriefId;
  if (!briefId) {
    const [brief] = await db
      .select()
      .from(productBriefs)
      .where(eq(productBriefs.projectId, input.projectId))
      .orderBy(desc(productBriefs.revision))
      .limit(1);
    briefId = brief?.id ?? null;
  }
  if (!briefId) {
    throw new IssueImportError(
      "invalid",
      "project needs an approved brief before importing issues",
    );
  }

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
