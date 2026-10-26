/**
 * Ship Receipt — Accept artifact for Open Program Runtime.
 * Records Open ID, spend, fitness/CI, winner profile, human touches, writeback.
 */

import { and, desc, eq } from "drizzle-orm";
import { extractArchitectureIdFromTitle } from "./architecture-backlog.js";
import {
  createArtifact,
  parseArtifactMeta,
} from "./artifacts.js";
import type { Database } from "./client.js";
import { getRunCiFitness } from "./ci-evidence.js";
import {
  agentRuns,
  artifacts,
  auditEvents,
  contenders,
  tournaments,
  type Artifact,
  type Task,
} from "./schema.js";

export const SHIP_RECEIPT_KIND = "ship_receipt";

export type ShipReceiptBody = {
  kind: "ship_receipt";
  openId: string | null;
  title: string;
  taskId: string;
  runId: string | null;
  spendMicros: number;
  fitnessScore: number | null;
  efficiencyScore: number | null;
  ci: {
    acceptReady: boolean;
    blocking: boolean;
    passed: boolean;
    checkCount: number;
  };
  winnerProfileKey: string | null;
  humanTouches: number;
  prUrl: string | null;
  prNumber: number | null;
  writeback: {
    architectureId: string | null;
    note: string;
  };
  acceptedAt: string;
  acceptedBy: string;
};

export function buildShipReceipt(input: {
  task: Pick<Task, "id" | "title" | "prUrl">;
  run: {
    id: string;
    actualCostMicros: number;
    fitnessScore: number | null;
    efficiencyScore: number | null;
    agentProfileKey: string;
    prUrl: string | null;
    prNumber: number | null;
  } | null;
  ci: ShipReceiptBody["ci"];
  humanTouches: number;
  acceptedBy: string;
  acceptedAt?: Date;
}): ShipReceiptBody {
  const openId = extractArchitectureIdFromTitle(input.task.title);
  return {
    kind: "ship_receipt",
    openId,
    title: input.task.title,
    taskId: input.task.id,
    runId: input.run?.id ?? null,
    spendMicros: input.run?.actualCostMicros ?? 0,
    fitnessScore: input.run?.fitnessScore ?? null,
    efficiencyScore: input.run?.efficiencyScore ?? null,
    ci: input.ci,
    winnerProfileKey: input.run?.agentProfileKey ?? null,
    humanTouches: input.humanTouches,
    prUrl: input.run?.prUrl ?? input.task.prUrl ?? null,
    prNumber: input.run?.prNumber ?? null,
    writeback: {
      architectureId: openId,
      note: openId
        ? `Open Program ${openId} → Done on Accept`
        : "No Open ID on task — writeback skipped",
    },
    acceptedAt: (input.acceptedAt ?? new Date()).toISOString(),
    acceptedBy: input.acceptedBy,
  };
}

/** True when the Accept actor is the maintainer / system auto path. */
export function isAutonomousAcceptActor(actor: string): boolean {
  const a = actor.trim().toLowerCase();
  return (
    a.startsWith("system:") ||
    a === "maintainer" ||
    a.includes("auto-accept") ||
    a.includes("auto_accept")
  );
}

/**
 * Count human review/approve touches. Autonomous Accept must report 0 when
 * no prior human action exists (do not inflate with Math.max(1,…)).
 */
export function resolveHumanTouchCount(input: {
  priorHumanActions: number;
  acceptedBy: string;
}): number {
  if (isAutonomousAcceptActor(input.acceptedBy)) {
    return Math.max(0, input.priorHumanActions);
  }
  // Human Accept itself counts as the closing touch when none recorded yet.
  return Math.max(1, input.priorHumanActions);
}

async function countHumanTouches(
  db: Database,
  workspaceId: string,
  taskId: string,
  acceptedBy: string,
): Promise<number> {
  const rows = await db
    .select({ action: auditEvents.action, actor: auditEvents.actor })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, workspaceId),
        eq(auditEvents.targetType, "task"),
        eq(auditEvents.targetId, taskId),
      ),
    );
  const humanActions = new Set([
    "task.review.accept",
    "task.review.reject",
    "task.review.request_changes",
    "task.approve",
    "merge.attempt",
  ]);
  let n = 0;
  for (const r of rows) {
    if (!humanActions.has(r.action)) continue;
    // Skip system auto-accept audits — they are not human touches.
    if (isAutonomousAcceptActor(r.actor)) continue;
    n += 1;
  }
  return resolveHumanTouchCount({
    priorHumanActions: n,
    acceptedBy,
  });
}

/**
 * Persist a ship_receipt artifact for the accepted task / latest run.
 * Idempotent per run: replaces prior ship_receipt body for the same run.
 */
export async function persistShipReceipt(
  db: Database,
  input: {
    workspaceId: string;
    task: Task;
    actor: string;
    runId?: string | null;
  },
): Promise<{ artifact: Artifact; receipt: ShipReceiptBody }> {
  let run =
    input.runId != null
      ? (
          await db
            .select()
            .from(agentRuns)
            .where(
              and(
                eq(agentRuns.id, input.runId),
                eq(agentRuns.workspaceId, input.workspaceId),
              ),
            )
            .limit(1)
        )[0]
      : undefined;

  if (!run) {
    const [latest] = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.taskId, input.task.id),
          eq(agentRuns.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    run = latest;
  }

  // Prefer tournament winner when present.
  if (run?.tournamentId) {
    const [tournament] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, run.tournamentId))
      .limit(1);
    if (tournament?.winnerRunId) {
      const [winner] = await db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.id, tournament.winnerRunId))
        .limit(1);
      if (winner) run = winner;
    }
  }

  let profileKey = run?.agentProfileKey ?? null;
  if (run?.contenderId) {
    const [c] = await db
      .select({ profileKey: contenders.profileKey })
      .from(contenders)
      .where(eq(contenders.id, run.contenderId))
      .limit(1);
    if (c?.profileKey) profileKey = c.profileKey;
  }

  const fitness = run
    ? await getRunCiFitness(db, run.id)
    : {
        checks: [],
        blocking: false,
        passed: false,
        awaitingLive: false,
        ciSatisfied: false,
        acceptReady: false,
      };

  const humanTouches = await countHumanTouches(
    db,
    input.workspaceId,
    input.task.id,
    input.actor,
  );

  const receipt = buildShipReceipt({
    task: input.task,
    run: run
      ? {
          id: run.id,
          actualCostMicros: run.actualCostMicros,
          fitnessScore: run.fitnessScore,
          efficiencyScore: run.efficiencyScore,
          agentProfileKey: profileKey ?? run.agentProfileKey,
          prUrl: run.prUrl,
          prNumber: run.prNumber,
        }
      : null,
    ci: {
      acceptReady: fitness.acceptReady,
      blocking: fitness.blocking,
      passed: fitness.passed,
      checkCount: fitness.checks.length,
    },
    humanTouches,
    acceptedBy: input.actor,
  });

  const artifact = await createArtifact(db, {
    workspaceId: input.workspaceId,
    projectId: input.task.projectId,
    taskId: input.task.id,
    runId: run?.id ?? null,
    kind: SHIP_RECEIPT_KIND,
    body: receipt,
    meta: {
      openId: receipt.openId,
      spendMicros: receipt.spendMicros,
    },
  });

  return { artifact, receipt };
}

export async function getShipReceiptForTask(
  db: Database,
  workspaceId: string,
  taskId: string,
): Promise<{ artifact: Artifact; receipt: ShipReceiptBody } | null> {
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.workspaceId, workspaceId),
        eq(artifacts.taskId, taskId),
        eq(artifacts.kind, SHIP_RECEIPT_KIND),
      ),
    )
    .orderBy(desc(artifacts.createdAt))
    .limit(1);

  const hit = rows[0];
  if (!hit) return null;
  const meta = parseArtifactMeta(hit);
  const inline = meta.inlineBody;
  if (typeof inline !== "string") return null;
  try {
    const receipt = JSON.parse(inline) as ShipReceiptBody;
    if (receipt.kind !== "ship_receipt") return null;
    return { artifact: hit, receipt };
  } catch {
    return null;
  }
}
