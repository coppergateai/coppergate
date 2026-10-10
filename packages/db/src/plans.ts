import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Database } from "./client.js";
import { BriefError, assertCanStartTasks, parseJsonArray } from "./briefs.js";
import { hasCycle, type GraphEdge } from "./graph.js";
import {
  auditEvents,
  milestones,
  taskDependencies,
  tasks,
  type Milestone,
  type Task,
  type TaskDependency,
} from "./schema.js";

export class PlanError extends Error {
  readonly code: "not_found" | "cycle" | "invalid_task" | "no_approved_brief";

  constructor(code: PlanError["code"], message: string) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

export type PlanTaskInput = {
  key: string;
  title: string;
  goal: string;
  scope: string;
  allowedPaths: string[];
  acceptanceCriteria: string[];
  estimateMicros: number;
  estimateComplexity: "S" | "M" | "L";
  dependsOn: string[];
  priority: number;
};

export type PlanMilestoneInput = {
  title: string;
  description: string;
  tasks: PlanTaskInput[];
};

export type PlanTaskView = {
  task: Task;
  dependsOnTaskIds: string[];
};

export type PlanMilestoneView = {
  milestone: Milestone;
  tasks: PlanTaskView[];
};

export type ProjectPlan = {
  briefId: string;
  milestones: PlanMilestoneView[];
  dependencies: TaskDependency[];
};

function validatePlanGraph(milestonesInput: PlanMilestoneInput[]): void {
  const keys = milestonesInput.flatMap((m) => m.tasks.map((t) => t.key));
  const unique = new Set(keys);
  if (unique.size !== keys.length) {
    throw new PlanError("invalid_task", "Duplicate task keys in plan draft");
  }

  for (const m of milestonesInput) {
    for (const t of m.tasks) {
      if (!t.title.trim() || !t.scope.trim()) {
        throw new PlanError(
          "invalid_task",
          "Each task needs title and scope",
        );
      }
      if (!t.acceptanceCriteria.length) {
        throw new PlanError(
          "invalid_task",
          "Each task needs acceptance criteria",
        );
      }
      if (t.estimateMicros == null || Number.isNaN(t.estimateMicros)) {
        throw new PlanError("invalid_task", "Each task needs an estimate");
      }
      for (const dep of t.dependsOn) {
        if (!unique.has(dep)) {
          throw new PlanError(
            "invalid_task",
            `Unknown dependency key: ${dep}`,
          );
        }
        if (dep === t.key) {
          throw new PlanError("cycle", "Task cannot depend on itself");
        }
      }
    }
  }

  const edges: GraphEdge[] = [];
  for (const m of milestonesInput) {
    for (const t of m.tasks) {
      for (const dep of t.dependsOn) {
        edges.push({ from: dep, to: t.key });
      }
    }
  }
  if (hasCycle(keys, edges)) {
    throw new PlanError("cycle", "Plan dependencies contain a cycle");
  }
}

/**
 * Replace draft plan for the project's approved brief with a new draft graph.
 */
export async function generateProjectPlan(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    milestones: PlanMilestoneInput[];
  },
): Promise<ProjectPlan> {
  validatePlanGraph(input.milestones);

  let brief;
  try {
    brief = await assertCanStartTasks(db, input.workspaceId, input.projectId);
  } catch (err) {
    if (err instanceof BriefError && err.code === "no_approved_brief") {
      throw new PlanError(
        "no_approved_brief",
        "Approve a product brief before generating a plan",
      );
    }
    if (err instanceof BriefError && err.code === "not_found") {
      throw new PlanError("not_found", "Project not found");
    }
    throw err;
  }

  return db.transaction(async (tx) => {
    const now = new Date();

    // Cancel prior draft milestones (cascade deletes tasks/deps via FK).
    const priorDrafts = await tx
      .select({ id: milestones.id })
      .from(milestones)
      .where(
        and(
          eq(milestones.projectId, input.projectId),
          eq(milestones.status, "draft"),
        ),
      );

    if (priorDrafts.length) {
      await tx
        .update(milestones)
        .set({ status: "cancelled", updatedAt: now })
        .where(
          inArray(
            milestones.id,
            priorDrafts.map((m) => m.id),
          ),
        );
      // Remove cancelled draft tasks so board stays clean
      await tx
        .delete(tasks)
        .where(
          and(
            eq(tasks.projectId, input.projectId),
            inArray(
              tasks.milestoneId,
              priorDrafts.map((m) => m.id),
            ),
          ),
        );
      await tx
        .delete(milestones)
        .where(
          inArray(
            milestones.id,
            priorDrafts.map((m) => m.id),
          ),
        );
    }

    const keyToId = new Map<string, string>();
    const createdMilestones: Milestone[] = [];
    const createdTasks: Task[] = [];
    const createdDeps: TaskDependency[] = [];

    let sequence = 1;
    for (const m of input.milestones) {
      const milestoneId = crypto.randomUUID();
      const estimateSum = m.tasks.reduce(
        (acc, t) => acc + (t.estimateMicros || 0),
        0,
      );
      const [milestone] = await tx
        .insert(milestones)
        .values({
          id: milestoneId,
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          briefId: brief.id,
          title: m.title.trim(),
          description: m.description,
          sequence,
          status: "draft",
          estimatedCostMicros: estimateSum,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!milestone) throw new Error("Failed to create milestone");
      createdMilestones.push(milestone);
      sequence += 1;

      for (const t of m.tasks) {
        const taskId = crypto.randomUUID();
        keyToId.set(t.key, taskId);
        const [task] = await tx
          .insert(tasks)
          .values({
            id: taskId,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            milestoneId,
            briefId: brief.id,
            title: t.title.trim(),
            goal: t.goal,
            scope: t.scope,
            allowedPaths: JSON.stringify(t.allowedPaths),
            acceptanceCriteria: JSON.stringify(t.acceptanceCriteria),
            estimateMicros: t.estimateMicros,
            estimateComplexity: t.estimateComplexity,
            status: "DRAFT",
            attemptCount: 0,
            maxAttempts: 3,
            priority: t.priority,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!task) throw new Error("Failed to create task");
        createdTasks.push(task);
      }
    }

    for (const m of input.milestones) {
      for (const t of m.tasks) {
        const succ = keyToId.get(t.key);
        if (!succ) continue;
        for (const depKey of t.dependsOn) {
          const pred = keyToId.get(depKey);
          if (!pred) {
            throw new PlanError("invalid_task", `Unknown dependency ${depKey}`);
          }
          const [dep] = await tx
            .insert(taskDependencies)
            .values({
              id: crypto.randomUUID(),
              workspaceId: input.workspaceId,
              predecessorTaskId: pred,
              successorTaskId: succ,
              createdAt: now,
            })
            .returning();
          if (dep) createdDeps.push(dep);
        }
      }
    }

    await tx.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      actor: input.actor,
      action: "plan.generate",
      targetType: "project",
      targetId: input.projectId,
      meta: JSON.stringify({
        briefId: brief.id,
        milestones: createdMilestones.length,
        tasks: createdTasks.length,
        dependencies: createdDeps.length,
      }),
      createdAt: now,
    });

    return assemblePlanView(
      brief.id,
      createdMilestones,
      createdTasks,
      createdDeps,
    );
  });
}

function assemblePlanView(
  briefId: string,
  milestoneRows: Milestone[],
  taskRows: Task[],
  depRows: TaskDependency[],
): ProjectPlan {
  const depsBySucc = new Map<string, string[]>();
  for (const d of depRows) {
    const list = depsBySucc.get(d.successorTaskId) ?? [];
    list.push(d.predecessorTaskId);
    depsBySucc.set(d.successorTaskId, list);
  }

  const sortedMilestones = [...milestoneRows].sort(
    (a, b) => a.sequence - b.sequence,
  );

  return {
    briefId,
    milestones: sortedMilestones.map((milestone) => ({
      milestone,
      tasks: taskRows
        .filter((t) => t.milestoneId === milestone.id)
        .sort((a, b) => a.priority - b.priority)
        .map((task) => ({
          task,
          dependsOnTaskIds: depsBySucc.get(task.id) ?? [],
        })),
    })),
    dependencies: depRows,
  };
}

export async function getProjectPlan(
  db: Database,
  workspaceId: string,
  projectId: string,
): Promise<ProjectPlan | null> {
  const milestoneRows = await db
    .select()
    .from(milestones)
    .where(
      and(
        eq(milestones.projectId, projectId),
        eq(milestones.workspaceId, workspaceId),
        ne(milestones.status, "cancelled"),
      ),
    )
    .orderBy(asc(milestones.sequence));

  if (!milestoneRows.length) return null;

  const milestoneIds = milestoneRows.map((m) => m.id);
  const taskRows = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.workspaceId, workspaceId),
        inArray(tasks.milestoneId, milestoneIds),
      ),
    );

  const taskIds = taskRows.map((t) => t.id);
  const depRows =
    taskIds.length === 0
      ? []
      : await db
          .select()
          .from(taskDependencies)
          .where(
            and(
              eq(taskDependencies.workspaceId, workspaceId),
              inArray(taskDependencies.successorTaskId, taskIds),
            ),
          );

  return assemblePlanView(
    milestoneRows[0]!.briefId,
    milestoneRows,
    taskRows,
    depRows,
  );
}

export function serializeTaskCriteria(task: Task): string[] {
  return parseJsonArray(task.acceptanceCriteria);
}

export function serializeAllowedPaths(task: Task): string[] {
  return parseJsonArray(task.allowedPaths);
}
