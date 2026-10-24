import { and, desc, eq } from "drizzle-orm";
import { assertSafeServerFetchUrlResolved } from "@coppergate/sandbox/policy";
import type { Database } from "./client.js";
import { createArtifact } from "./artifacts.js";
import { appendRunEvent } from "./run-events.js";
import { agentRuns, type AgentRun } from "./schema.js";

async function resolveRun(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
  },
): Promise<AgentRun | null> {
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
    return row ?? null;
  }
  if (input.headSha && input.workspaceId) {
    const [row] = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.headSha, input.headSha),
          eq(agentRuns.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    return row ?? null;
  }
  return null;
}

async function attachFitnessArtifact(
  db: Database,
  run: AgentRun,
  input: {
    source: string;
    validator: string;
    passed: boolean;
    blocksAccept: boolean;
    summary: string;
    body: Record<string, unknown>;
    errorCode?: string;
  },
): Promise<void> {
  await appendRunEvent(db, {
    runId: run.id,
    workspaceId: run.workspaceId,
    kind: "evidence",
    payload: {
      message: input.summary,
      fitness: {
        source: input.source,
        passed: input.passed,
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
      source: input.source,
      passed: input.passed,
      blocksAccept: input.blocksAccept,
      ...input.body,
    },
    meta: {
      passed: input.passed,
      blocksAccept: input.blocksAccept,
      summary: input.summary,
      validator: input.validator,
    },
  });
  if (!input.passed && input.blocksAccept) {
    await db
      .update(agentRuns)
      .set({
        errorCode: input.errorCode ?? `${input.source}_failed`,
        errorMessage: input.summary,
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));
  }
}

/** TASK074 — coverage drop beyond threshold fails fitness. */
export async function ingestCoverageFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    coveragePercent: number;
    baselinePercent?: number | null;
    /** Absolute drop allowed before fail (default 1.0). */
    maxDropPercent?: number;
    provider?: "codecov" | "coveralls";
    detailsUrl?: string | null;
  },
): Promise<{ run: AgentRun | null; attached: boolean; passed: boolean }> {
  const run = await resolveRun(db, input);
  if (!run) return { run: null, attached: false, passed: false };
  const maxDrop = input.maxDropPercent ?? 1.0;
  const baseline = input.baselinePercent;
  const dropped =
    baseline != null && Number.isFinite(baseline)
      ? baseline - input.coveragePercent
      : 0;
  const passed = dropped <= maxDrop;
  await attachFitnessArtifact(db, run, {
    source: "coverage_delta",
    validator: `${input.provider ?? "codecov"}-coverage-v1`,
    passed,
    blocksAccept: !passed,
    summary: passed
      ? `Coverage ${input.coveragePercent.toFixed(2)}% (ok)`
      : `Coverage drop ${dropped.toFixed(2)}% exceeds ${maxDrop}%`,
    errorCode: "coverage_failed",
    body: {
      coveragePercent: input.coveragePercent,
      baselinePercent: baseline ?? null,
      maxDropPercent: maxDrop,
      provider: input.provider ?? "codecov",
      detailsUrl: input.detailsUrl ?? null,
    },
  });
  return { run, attached: true, passed };
}

/** TASK095 — e2e (Playwright/Cypress) fitness. */
export async function ingestE2eFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    passed: boolean;
    framework?: "playwright" | "cypress" | "selenium" | string;
    failedTests?: string[];
    detailsUrl?: string | null;
  },
): Promise<{ run: AgentRun | null; attached: boolean }> {
  const run = await resolveRun(db, input);
  if (!run) return { run: null, attached: false };
  await attachFitnessArtifact(db, run, {
    source: "e2e",
    validator: `e2e-${input.framework ?? "generic"}-v1`,
    passed: input.passed,
    blocksAccept: !input.passed,
    summary: input.passed
      ? `E2E (${input.framework ?? "generic"}) passed`
      : `E2E failed: ${(input.failedTests ?? []).slice(0, 5).join(", ") || "tests"}`,
    errorCode: "e2e_failed",
    body: {
      framework: input.framework ?? "generic",
      failedTests: input.failedTests ?? [],
      detailsUrl: input.detailsUrl ?? null,
    },
  });
  return { run, attached: true };
}

/** TASK096 — Lighthouse / perf budget. */
export async function ingestPerfFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    passed: boolean;
    category?: string;
    score?: number | null;
    budgetName?: string | null;
    detailsUrl?: string | null;
  },
): Promise<{ run: AgentRun | null; attached: boolean }> {
  const run = await resolveRun(db, input);
  if (!run) return { run: null, attached: false };
  await attachFitnessArtifact(db, run, {
    source: "perf_budget",
    validator: "lighthouse-perf-v1",
    passed: input.passed,
    blocksAccept: !input.passed,
    summary: input.passed
      ? `Perf budget ok (${input.category ?? "lighthouse"})`
      : `Perf budget failed (${input.budgetName ?? input.category ?? "budget"})`,
    errorCode: "perf_failed",
    body: {
      category: input.category ?? null,
      score: input.score ?? null,
      budgetName: input.budgetName ?? null,
      detailsUrl: input.detailsUrl ?? null,
    },
  });
  return { run, attached: true };
}

/** TASK099 — optional k6 / load budget (disabled by default at call site). */
export async function ingestLoadBudgetFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    passed: boolean;
    p95Ms?: number | null;
    budgetP95Ms?: number | null;
    detailsUrl?: string | null;
  },
): Promise<{ run: AgentRun | null; attached: boolean }> {
  const run = await resolveRun(db, input);
  if (!run) return { run: null, attached: false };
  await attachFitnessArtifact(db, run, {
    source: "load_budget",
    validator: "k6-load-v1",
    passed: input.passed,
    blocksAccept: !input.passed,
    summary: input.passed
      ? `Load budget ok (p95=${input.p95Ms ?? "n/a"}ms)`
      : `Load budget failed (p95=${input.p95Ms ?? "n/a"} > ${input.budgetP95Ms ?? "budget"})`,
    errorCode: "load_budget_failed",
    body: {
      p95Ms: input.p95Ms ?? null,
      budgetP95Ms: input.budgetP95Ms ?? null,
      detailsUrl: input.detailsUrl ?? null,
    },
  });
  return { run, attached: true };
}

/** TASK097 — Visual regress (Percy / Chromatic / Playwright screenshots). */
export async function ingestVisualRegressFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    passed: boolean;
    provider?: "percy" | "chromatic" | "playwright" | string;
    changedSnapshots?: number;
    detailsUrl?: string | null;
  },
): Promise<{ run: AgentRun | null; attached: boolean }> {
  const run = await resolveRun(db, input);
  if (!run) return { run: null, attached: false };
  await attachFitnessArtifact(db, run, {
    source: "visual_regress",
    validator: `visual-${input.provider ?? "generic"}-v1`,
    passed: input.passed,
    blocksAccept: !input.passed,
    summary: input.passed
      ? `Visual regress (${input.provider ?? "generic"}) passed`
      : `Visual regress failed (${input.changedSnapshots ?? "?"} diffs)`,
    errorCode: "visual_regress_failed",
    body: {
      provider: input.provider ?? "generic",
      changedSnapshots: input.changedSnapshots ?? null,
      detailsUrl: input.detailsUrl ?? null,
    },
  });
  return { run, attached: true };
}

/** TASK098 — Preview URL HTTP smoke. */
export async function ingestPreviewSmokeFitness(
  db: Database,
  input: {
    headSha?: string | null;
    runId?: string | null;
    workspaceId?: string | null;
    previewUrl: string;
    /** soft = record only; hard = blocks accept */
    mode?: "soft" | "hard";
    timeoutMs?: number;
  },
): Promise<{ run: AgentRun | null; attached: boolean; passed: boolean }> {
  const run = await resolveRun(db, input);
  if (!run) return { run: null, attached: false, passed: false };
  const mode = input.mode ?? "soft";
  let passed = false;
  let status: number | null = null;
  let error: string | null = null;
  try {
    await assertSafeServerFetchUrlResolved(input.previewUrl, {
      requireHttps: true,
    });
    const res = await fetch(input.previewUrl, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(input.timeoutMs ?? 8_000),
    });
    status = res.status;
    passed = res.ok;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    passed = false;
  }
  await attachFitnessArtifact(db, run, {
    source: "preview_smoke",
    validator: "preview-smoke-v1",
    passed,
    blocksAccept: mode === "hard" && !passed,
    summary: passed
      ? `Preview smoke ok (${status})`
      : `Preview smoke failed (${error ?? status ?? "error"})`,
    errorCode: "preview_smoke_failed",
    body: {
      previewUrl: input.previewUrl,
      status,
      mode,
      error,
    },
  });
  return { run, attached: true, passed };
}
