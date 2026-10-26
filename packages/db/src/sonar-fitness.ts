import type { Database } from "./client.js";
import { createArtifact } from "./artifacts.js";
import { appendRunEvent } from "./run-events.js";
import { agentRuns, type AgentRun } from "./schema.js";
import { and, desc, eq } from "drizzle-orm";

/**
 * Attach Sonar quality-gate evidence to a run (TASK069 fitness).
 */
export async function ingestSonarFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    gateStatus: string;
    projectKey?: string | null;
    detailsUrl?: string | null;
  },
): Promise<{ run: AgentRun | null; attached: boolean }> {
  const passed =
    input.gateStatus.toUpperCase() === "OK" ||
    input.gateStatus.toUpperCase() === "PASSED" ||
    input.gateStatus.toUpperCase() === "SUCCESS";
  const failed =
    input.gateStatus.toUpperCase() === "ERROR" ||
    input.gateStatus.toUpperCase() === "FAILED" ||
    input.gateStatus.toUpperCase() === "FAIL";

  let run: AgentRun | null = null;
  if (input.runId && input.workspaceId) {
    const [row] = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, input.runId),
          eq(agentRuns.workspaceId, input.workspaceId),
        ),
      )
      .limit(1);
    run = row ?? null;
  } else if (input.headSha && input.workspaceId) {
    // Require a unique match — ambiguous SHAs must supply runId.
    const rows = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.headSha, input.headSha),
          eq(agentRuns.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(2);
    run = rows.length === 1 ? (rows[0] ?? null) : null;
  }

  if (!run) return { run: null, attached: false };

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: `Sonar quality gate: ${input.gateStatus}`,
      sonar: {
        gateStatus: input.gateStatus,
        passed: failed ? false : passed ? true : null,
        projectKey: input.projectKey ?? null,
        detailsUrl: input.detailsUrl ?? null,
      },
    },
  });

  await createArtifact(db, {
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    taskId: run.taskId,
    runId: run.id,
    kind: "validation_report",
    body: {
      source: "sonar_quality_gate",
      gateStatus: input.gateStatus,
      passed: failed ? false : passed,
      blocksAccept: failed,
      projectKey: input.projectKey ?? null,
      detailsUrl: input.detailsUrl ?? null,
    },
    meta: {
      passed: failed ? false : passed,
      blocksAccept: failed,
      summary: `Sonar gate ${input.gateStatus}`,
      validator: "sonar-quality-gate-v1",
    },
  });

  if (failed) {
    await db
      .update(agentRuns)
      .set({
        errorCode: "sonar_failed",
        errorMessage: `Sonar quality gate ${input.gateStatus}`,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
  }

  return { run, attached: true };
}
