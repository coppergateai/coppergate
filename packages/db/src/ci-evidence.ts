import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { createArtifact } from "./artifacts.js";
import { appendRunEvent } from "./run-events.js";
import { agentRuns, type AgentRun } from "./schema.js";
export type CiEvidenceInput = {
  headSha: string | null;
  name: string;
  status: string;
  conclusion: string | null;
  passed: boolean;
  blocksAccept: boolean;
  checkRunId: number | null;
  detailsUrl: string | null;
  repoFullName: string | null;
};

/**
 * Attach CI evidence to the latest run matching headSha.
 * Failing checks prevent auto ACCEPTED (task stays REVIEW_REQUIRED or → FAILED).
 */
export async function ingestCiEvidence(
  db: Database,
  evidence: CiEvidenceInput,
): Promise<{ run: AgentRun | null; attached: boolean }> {
  if (!evidence.headSha) {
    return { run: null, attached: false };
  }

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.headSha, evidence.headSha))
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);

  if (!run) {
    return { run: null, attached: false };
  }

  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: `CI ${evidence.name}: ${evidence.conclusion ?? evidence.status}`,
      ci: {
        name: evidence.name,
        status: evidence.status,
        conclusion: evidence.conclusion,
        passed: evidence.passed,
        blocksAccept: evidence.blocksAccept,
        checkRunId: evidence.checkRunId,
        detailsUrl: evidence.detailsUrl,
        repoFullName: evidence.repoFullName,
        headSha: evidence.headSha,
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
      source: "github_check",
      ...evidence,
    },
    meta: {
      passed: evidence.passed,
      blocksAccept: evidence.blocksAccept,
      summary: `CI ${evidence.name}: ${evidence.conclusion ?? evidence.status}`,
      validator: "github-check-v1",
    },
  });

  if (evidence.blocksAccept) {
    // Flag run so accept UI/API (TASK024) can refuse ACCEPTED auto-path.
    await db
      .update(agentRuns)
      .set({
        errorCode: "ci_failed",
        errorMessage: `CI ${evidence.name} ${evidence.conclusion}`,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
  }

  return { run, attached: true };
}

/** True if any CI validation artifact for the run blocks accept. */
export async function runHasBlockingCi(
  db: Database,
  runId: string,
): Promise<boolean> {
  const { artifacts } = await import("./schema.js");
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(eq(artifacts.runId, runId), eq(artifacts.kind, "validation_report")),
    );
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.meta) as { blocksAccept?: boolean };
      if (meta.blocksAccept === true) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
