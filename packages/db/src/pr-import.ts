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

export class PrImportError extends Error {
  readonly code: "not_found" | "invalid" | "conflict";
  constructor(code: PrImportError["code"], message: string) {
    super(message);
    this.name = "PrImportError";
    this.code = code;
  }
}

/**
 * Create a DRAFT task from an open GitHub PR for review-only delivery.
 */
export async function importGithubPrAsTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    prNumber: number;
    title: string;
    body?: string | null;
  },
): Promise<Task> {
  if (!Number.isInteger(input.prNumber) || input.prNumber < 1) {
    throw new PrImportError("invalid", "prNumber must be a positive integer");
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
  if (!project) throw new PrImportError("not_found", "project not found");

  const existing = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, input.projectId),
        eq(tasks.githubPrNumber, input.prNumber),
      ),
    )
    .limit(1);
  if (existing[0]) {
    throw new PrImportError(
      "conflict",
      `PR #${input.prNumber} already imported as task`,
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
    throw new PrImportError(
      "invalid",
      "project needs an approved brief before importing PRs",
    );
  }

  let [milestone] = await db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.projectId, input.projectId),
        eq(milestones.title, "PR review imports"),
      ),
    )
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
        title: "PR review imports",
        description: "Tasks imported from open GitHub pull requests for review",
        sequence: 998,
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
      scope: `Imported from GitHub PR #${input.prNumber}`,
      allowedPaths: JSON.stringify(["**/*"]),
      acceptanceCriteria: JSON.stringify([
        `Review findings posted on GitHub PR #${input.prNumber}`,
        "Does not open a new pull request",
      ]),
      estimateMicros: 40_000,
      estimateComplexity: "S",
      status: "DRAFT",
      githubPrNumber: input.prNumber,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "task.import_pr",
    targetType: "task",
    targetId: task!.id,
    meta: { prNumber: input.prNumber },
  });

  return task!;
}
