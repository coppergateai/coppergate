/**
 * AG-031 — Ship-gate tip-red self-heal (DB ensure).
 *
 * When default-branch CI is red, auto-merge halts. Without a heal task the
 * dogfood loop deadlocks. System-initiated `[ship-gate]` tasks are
 * spend-licensed as reliability work (not freestyle invent).
 */

import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { recordAuditEvent } from "./briefs.js";
import {
  milestones,
  productBriefs,
  projects,
  tasks,
} from "./schema.js";
import {
  SHIP_GATE_HEAL_MARKER,
  buildShipGateHealTitle,
} from "./ship-gate-heal-policy.js";
import {
  approveTask,
  submitTaskForApproval,
} from "./task-transitions.js";

export {
  DIRTY_PR_HEAL_GRACE_MS,
  SHIP_GATE_HEAL_MARKER,
  STALE_REVIEW_AFTER_CI_TIMEOUT_MS,
  buildShipGateHealTitle,
  isShipGateHealTitle,
  openTaskCountsAsBusyForBacklog,
  shipGateMergeMode,
  shouldInspectDeliveryPrForUnattendedHeal,
  shouldRequestChangesForStaleCiTimeoutReview,
  shouldRetireObsoleteShipGateHeal,
  type ShipGateMergeMode,
} from "./ship-gate-heal-policy.js";

const OPEN_HEAL_STATUSES = [
  "DRAFT",
  "READY_FOR_APPROVAL",
  "QUEUED",
  "RUNNING",
  "VALIDATING",
  "WAITING_CI",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "NEEDS_REPLAN",
] as const;

export type EnsureShipGateHealResult = {
  created: boolean;
  queued: boolean;
  taskId: string | null;
  skippedReason?: string;
};

/**
 * Ensure one open `[ship-gate]` heal task exists for this tip SHA, then
 * submit + approve so min_human / arena can pick it up.
 */
export async function ensureShipGateHealTask(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    headSha: string;
    defaultBranch?: string | null;
    /** When false, create DRAFT only (tests / dry). Default true. */
    autoQueue?: boolean;
  },
): Promise<EnsureShipGateHealResult> {
  const title = buildShipGateHealTitle(input.headSha);
  const short = input.headSha.trim().slice(0, 8);

  const existing = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, input.workspaceId),
        eq(tasks.projectId, input.projectId),
        inArray(tasks.status, [...OPEN_HEAL_STATUSES]),
        ilike(tasks.title, `%${SHIP_GATE_HEAL_MARKER}%`),
      ),
    )
    .orderBy(desc(tasks.updatedAt))
    .limit(5);

  const sameSha = existing.find((t) =>
    t.title.toLowerCase().includes(`(${short.toLowerCase()})`),
  );
  const openHeal = sameSha ?? existing[0];
  if (openHeal) {
    let queued = false;
    if (input.autoQueue !== false) {
      queued = await tryQueueHealTask(db, {
        workspaceId: input.workspaceId,
        taskId: openHeal.id,
        actor: input.actor,
        status: openHeal.status,
      });
    }
    return {
      created: false,
      queued,
      taskId: openHeal.id,
      skippedReason: "heal_already_open",
    };
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
  if (!project) {
    return {
      created: false,
      queued: false,
      taskId: null,
      skippedReason: "project_not_found",
    };
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
    return {
      created: false,
      queued: false,
      taskId: null,
      skippedReason: "no_brief",
    };
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
        title: "Ship-gate heal",
        description: "System tasks to restore default-branch CI (AG-031)",
        sequence: 997,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    milestone = created!;
  }

  const branch = input.defaultBranch?.trim() || "main";
  const now = new Date();
  const [task] = await db
    .insert(tasks)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      milestoneId: milestone.id,
      briefId,
      title,
      goal: [
        `Default-branch CI is red on ${branch} @ ${short}.`,
        "Auto-merge is halted (ship gate). Fix tip CI only — no unrelated features.",
        "Prefer the smallest change that makes the required `check` job green on the default branch.",
        "Do not stack product work while tip is red.",
      ].join(" "),
      scope: `Ship-gate heal for ${branch}@${short}`,
      allowedPaths: JSON.stringify(["**/*"]),
      acceptanceCriteria: JSON.stringify([
        `Required check on ${branch} tip is green`,
        "PR title keeps [ship-gate] marker",
        "No unrelated product scope in the same PR",
      ]),
      estimateMicros: 150_000,
      estimateComplexity: "S",
      status: "DRAFT",
      priority: -100,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = task!;
  await recordAuditEvent(db, {
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "ship_gate.heal_enqueued",
    targetType: "task",
    targetId: created.id,
    meta: {
      projectId: input.projectId,
      headSha: input.headSha,
      defaultBranch: branch,
      title: created.title,
    },
  });

  let queued = false;
  if (input.autoQueue !== false) {
    queued = await tryQueueHealTask(db, {
      workspaceId: input.workspaceId,
      taskId: created.id,
      actor: input.actor,
      status: created.status,
    });
  }

  return { created: true, queued, taskId: created.id };
}

async function tryQueueHealTask(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    actor: string;
    status: string;
  },
): Promise<boolean> {
  try {
    if (input.status === "DRAFT" || input.status === "NEEDS_REPLAN") {
      await submitTaskForApproval(db, {
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        actor: input.actor,
      });
      await approveTask(db, {
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        actor: input.actor,
      });
      return true;
    }
    if (input.status === "READY_FOR_APPROVAL") {
      await approveTask(db, {
        workspaceId: input.workspaceId,
        taskId: input.taskId,
        actor: input.actor,
      });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
