import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { createArtifact } from "./artifacts.js";
import { appendRunEvent } from "./run-events.js";
import { agentRuns, artifacts, type AgentRun } from "./schema.js";

/** Runs that still need CI evidence attached for unattended accept. */
const CI_ATTACH_RUN_STATUSES = [
  "WAITING_CI",
  "REVIEW_REQUIRED",
  "VALIDATING",
] as const;

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
 * Attach CI evidence to every active run matching headSha in the workspace.
 *
 * Attaching only to the newest run left peer WAITING_CI runs (fixer vs qa on the
 * same PR) without the required check — auto-accept deadlocked forever.
 */
export async function ingestCiEvidence(
  db: Database,
  evidence: CiEvidenceInput,
): Promise<{ run: AgentRun | null; attached: boolean }> {
  if (!evidence.headSha || !evidence.workspaceId.trim()) {
    return { run: null, attached: false };
  }

  const matches = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.headSha, evidence.headSha),
        eq(agentRuns.workspaceId, evidence.workspaceId),
        inArray(agentRuns.status, [...CI_ATTACH_RUN_STATUSES]),
      ),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(20);

  // Fallback: terminal/other statuses still get evidence on the newest match
  // (webhook race before WAITING_CI, or late check after promote).
  const targets =
    matches.length > 0
      ? matches
      : await db
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

  if (targets.length === 0) {
    return { run: null, attached: false };
  }

  let primary: AgentRun | null = null;
  for (const run of targets) {
    const updated = await attachCiEvidenceToRun(db, run, evidence);
    if (!primary) primary = updated;
  }
  return { run: primary, attached: true };
}

async function attachCiEvidenceToRun(
  db: Database,
  run: AgentRun,
  evidence: CiEvidenceInput,
): Promise<AgentRun> {
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
      const promoted = fresh ?? run;
      // Tournament scoring waits for REVIEW_REQUIRED — resolve once peers are ready.
      if (promoted.tournamentId) {
        try {
          const { maybeScoreAndResolveTournament } = await import(
            "./fitness.js"
          );
          await maybeScoreAndResolveTournament(db, {
            workspaceId: promoted.workspaceId,
            tournamentId: promoted.tournamentId,
            actor: "system:ci-evidence",
          });
        } catch {
          /* peer may still be WAITING_CI */
        }
      }
      return promoted;
    } catch {
      /* best-effort */
    }
  }

  return run;
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

/** Parse CI_REQUIRED_CHECK_NAMES (default: branch-protection "test"). */
export function resolveRequiredCheckNames(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.CI_REQUIRED_CHECK_NAMES ?? "test")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Score CI checks for accept / promote.
 *
 * When required names are configured, unrelated helper greens must NOT satisfy
 * the gate while the required context is still missing (fail closed / pending).
 * Empty checks remain vacuous (synthetic `no_required_checks` evidence path).
 */
export function scoreCiChecks(
  checks: Pick<RunCiCheckSummary, "name" | "passed" | "blocksAccept">[],
  options: {
    requiredNames: string[];
    statusAwaitingCi: boolean;
  },
): Omit<RunCiFitness, "checks"> {
  const requiredNames = new Set(options.requiredNames);
  const requiredConfigured = requiredNames.size > 0;
  const isRequired = (name: string) =>
    !requiredConfigured || requiredNames.has(name);
  const requiredReported = checks.filter((c) => isRequired(c.name));
  // Only required contexts block accept — helper jobs often fail without gating merge.
  const blocking = requiredReported.some((c) => c.blocksAccept);

  let passed: boolean;
  if (!requiredConfigured) {
    passed =
      checks.some((c) => c.passed && !c.blocksAccept) ||
      // Vacuous only when not explicitly waiting on live CI.
      (checks.length === 0 && !options.statusAwaitingCi);
  } else if (requiredReported.length === 0) {
    // Required configured but none reported: helpers alone ≠ pass.
    // Empty is vacuous only when the run is not WAITING_CI (fail closed while awaiting).
    passed = checks.length === 0 && !options.statusAwaitingCi;
  } else {
    passed = requiredReported.some((c) => c.passed) && !blocking;
  }

  const awaitingLive = options.statusAwaitingCi;
  const ciSatisfied = !blocking && passed;
  const acceptReady = !options.statusAwaitingCi && !blocking && passed;

  return {
    blocking,
    passed,
    awaitingLive,
    ciSatisfied,
    acceptReady,
  };
}

export async function getRunCiFitness(
  db: Database,
  runId: string,
): Promise<RunCiFitness> {
  const checks = await listRunCiChecks(db, runId);
  const [run] = await db
    .select({ status: agentRuns.status })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);
  const statusAwaitingCi = run?.status === "WAITING_CI";
  const scored = scoreCiChecks(checks, {
    requiredNames: resolveRequiredCheckNames(),
    statusAwaitingCi,
  });

  return {
    checks,
    ...scored,
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
