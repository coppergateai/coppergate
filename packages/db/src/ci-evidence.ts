import { and, desc, eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { createArtifact } from "./artifacts.js";
import { appendRunEvent, listRunEvents } from "./run-events.js";
import { agentRuns, artifacts, type AgentRun } from "./schema.js";

export type CiEvidenceInput = {
  /** Required — headSha lookups must be tenant-scoped (no cross-workspace attach). */
  workspaceId: string;
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

export type RunCiCheckSummary = {
  name: string;
  status: string;
  conclusion: string | null;
  passed: boolean;
  blocksAccept: boolean;
  detailsUrl: string | null;
  createdAt: Date;
};

export type RunCiFitness = {
  checks: RunCiCheckSummary[];
  /** Latest conclusion per check name is blocking. */
  blocking: boolean;
  /** At least one latest check passed. */
  passed: boolean;
  /** Worker emitted fitness-pending (live http delivery). */
  awaitingLive: boolean;
  /**
   * CI gate cleared enough to leave WAITING_CI (green or vacuous no-CI evidence).
   * Distinct from acceptReady — Accept still requires REVIEW_REQUIRED.
   */
  ciSatisfied: boolean;
  /** Safe to Accept: not WAITING_CI; not blocking; if awaiting live CI, must have passed. */
  acceptReady: boolean;
};

type CiArtifactMeta = {
  blocksAccept?: boolean;
  passed?: boolean;
  summary?: string;
  checkName?: string;
  validator?: string;
  inlineBody?: string;
};

type CiArtifactBody = {
  source?: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  passed?: boolean;
  blocksAccept?: boolean;
  detailsUrl?: string | null;
};

/**
 * Attach CI evidence to the latest run matching headSha within a workspace.
 * Failing checks prevent auto ACCEPTED (task stays REVIEW_REQUIRED or → FAILED).
 */
export async function ingestCiEvidence(
  db: Database,
  evidence: CiEvidenceInput,
): Promise<{ run: AgentRun | null; attached: boolean }> {
  if (!evidence.headSha || !evidence.workspaceId.trim()) {
    return { run: null, attached: false };
  }

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.headSha, evidence.headSha),
        eq(agentRuns.workspaceId, evidence.workspaceId),
      ),
    )
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
      checkName: evidence.name,
    },
  });

  const fitness = await getRunCiFitness(db, run.id);

  if (fitness.blocking) {
    await db
      .update(agentRuns)
      .set({
        errorCode: "ci_failed",
        errorMessage: `CI ${evidence.name} ${evidence.conclusion}`,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
  } else if (run.errorCode === "ci_failed") {
    // A later green check for the same name cleared the only blocker.
    await db
      .update(agentRuns)
      .set({
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
  }

  // Promote on ciSatisfied — acceptReady is intentionally false while WAITING_CI.
  if (fitness.ciSatisfied && run.status === "WAITING_CI") {
    try {
      const { promoteRunFromWaitingCi } = await import("./run-events.js");
      const { applyTaskTransition } = await import("./task-transitions.js");
      const { tasks } = await import("./schema.js");
      const { eq: eqCol } = await import("drizzle-orm");
      await promoteRunFromWaitingCi(db, run.id);
      const [task] = await db
        .select()
        .from(tasks)
        .where(eqCol(tasks.id, run.taskId))
        .limit(1);
      if (task?.status === "WAITING_CI") {
        await applyTaskTransition(db, {
          workspaceId: run.workspaceId,
          taskId: run.taskId,
          toStatus: "REVIEW_REQUIRED",
          actor: "system:ci-evidence",
          reason: "live CI accept-ready",
        });
      }
      const [fresh] = await db
        .select()
        .from(agentRuns)
        .where(eq(agentRuns.id, run.id))
        .limit(1);
      return { run: fresh ?? run, attached: true };
    } catch {
      /* best-effort */
    }
  }

  return { run, attached: true };
}

/** Latest CI check state per name (github_check validation_report artifacts). */
export async function listRunCiChecks(
  db: Database,
  runId: string,
): Promise<RunCiCheckSummary[]> {
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(eq(artifacts.runId, runId), eq(artifacts.kind, "validation_report")),
    )
    .orderBy(desc(artifacts.createdAt));

  const byName = new Map<string, RunCiCheckSummary>();
  for (const row of rows) {
    let meta: CiArtifactMeta = {};
    try {
      meta = JSON.parse(row.meta) as CiArtifactMeta;
    } catch {
      /* ignore */
    }
    let body: CiArtifactBody = {};
    if (typeof meta.inlineBody === "string") {
      try {
        body = JSON.parse(meta.inlineBody) as CiArtifactBody;
      } catch {
        /* ignore */
      }
    }
    // Skip in-worker FakeCodingAgent validation — live CI / Sonar gate Accept.
    if (meta.validator === "fake-v1") continue;
    // Include GitHub checks + other fitness gates (Sonar, etc.) that set accept flags.
    const hasAcceptFlag =
      typeof meta.blocksAccept === "boolean" ||
      typeof meta.passed === "boolean" ||
      typeof body.blocksAccept === "boolean" ||
      typeof body.passed === "boolean";
    if (!hasAcceptFlag) continue;
    const source =
      (typeof body.source === "string" && body.source) ||
      (typeof meta.validator === "string" && meta.validator) ||
      "check";
    const shortName =
      (typeof body.name === "string" && body.name) ||
      (typeof meta.checkName === "string" && meta.checkName) ||
      source;
    const key = `${source}:${shortName}`;
    if (byName.has(key)) continue;
    byName.set(key, {
      name: shortName,
      status: typeof body.status === "string" ? body.status : "unknown",
      conclusion:
        typeof body.conclusion === "string" || body.conclusion === null
          ? (body.conclusion ?? null)
          : null,
      passed: body.passed === true || meta.passed === true,
      blocksAccept:
        body.blocksAccept === true || meta.blocksAccept === true,
      detailsUrl:
        typeof body.detailsUrl === "string" ? body.detailsUrl : null,
      createdAt: row.createdAt,
    });
  }
  return [...byName.values()];
}

export async function getRunCiFitness(
  db: Database,
  runId: string,
): Promise<RunCiFitness> {
  const checks = await listRunCiChecks(db, runId);
  const blocking = checks.some((c) => c.blocksAccept);
  const passed = checks.some((c) => c.passed && !c.blocksAccept);

  const [run] = await db
    .select({ status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  const statusAwaitingCi = run?.status === "WAITING_CI";

  let eventAwaitingLive = false;
  try {
    const events = await listRunEvents(db, runId);
    eventAwaitingLive = events.some((e) => {
      try {
        const payload = JSON.parse(e.payload) as {
          fitness?: unknown;
        };
        return payload.fitness === "pending";
      } catch {
        return false;
      }
    });
  } catch {
    eventAwaitingLive = false;
  }

  // Run status is source of truth — do not rely solely on fitness:pending events
  // (worker can crash after markRunWaitingCi before the evidence event is written).
  const awaitingLive = statusAwaitingCi || eventAwaitingLive;
  // Green (or vacuous no-CI) evidence clears the gate even while still WAITING_CI.
  const ciSatisfied = !blocking && passed;
  // Accept stays fail-closed until promoted out of WAITING_CI.
  const acceptReady =
    !statusAwaitingCi && !blocking && (!awaitingLive || passed);

  return {
    checks,
    blocking,
    passed,
    awaitingLive,
    ciSatisfied,
    acceptReady,
  };
}

/** True if any latest CI check for the run blocks accept. */
export async function runHasBlockingCi(
  db: Database,
  runId: string,
): Promise<boolean> {
  const fitness = await getRunCiFitness(db, runId);
  return fitness.blocking;
}

/** True when Accept is allowed given live CI / evidence state. */
export async function runCiAcceptReady(
  db: Database,
  runId: string,
): Promise<boolean> {
  const fitness = await getRunCiFitness(db, runId);
  return fitness.acceptReady;
}
