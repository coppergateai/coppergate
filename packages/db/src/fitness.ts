import { and, eq } from "drizzle-orm";
import {
  ArenaError,
  claimTournamentForScoring,
  computeEfficiencyPayoff,
  DEFAULT_PAYOFF_ALPHA,
  debitTournamentLosers,
  getArenaForProject,
  isTerminalRunStatus,
  listRunsForTournament,
  resolveTournamentByFitness,
} from "./arena.js";
import { createArtifact, listArtifactsForRun } from "./artifacts.js";
import type { Database } from "./client.js";
import { listRunEvents } from "./run-events.js";
import {
  agentRuns,
  auditEvents,
  tournaments,
  type AgentRun,
  type Tournament,
} from "./schema.js";

export type CriticSignals = {
  ciPassed: boolean | null;
  validationPassed: boolean | null;
  hasPr: boolean;
  hasDiffEvidence: boolean;
  blockingFailure: boolean;
  /** Sonar / quality-gate fitness (TASK069). null = unknown. */
  sonarPassed?: boolean | null;
  /** Coverage delta (TASK074). */
  coveragePassed?: boolean | null;
  /** E2E suite (TASK095). */
  e2ePassed?: boolean | null;
};

export type CriticScore = {
  score: number;
  breakdown: {
    ci: number;
    validation: number;
    delivery: number;
    criticPenalty: number;
    sonar: number;
    coverage: number;
    e2e: number;
  };
  reasons: string[];
};

/** Rules-based critic (TASK050 + quality/e2e fitness gates). */
export function scoreWithRulesCritic(signals: CriticSignals): CriticScore {
  const reasons: string[] = [];
  let ci = 0;
  let validation = 0;
  let delivery = 0;
  let criticPenalty = 0;
  let sonar = 0;
  let coverage = 0;
  let e2e = 0;

  if (signals.blockingFailure) {
    criticPenalty -= 0.5;
    reasons.push("blocking_failure");
  }

  if (signals.ciPassed === true) {
    ci = 0.3;
    reasons.push("ci_passed");
  } else if (signals.ciPassed === false) {
    ci = 0;
    reasons.push("ci_failed");
  } else {
    ci = 0.08;
    reasons.push("ci_unknown");
  }

  if (signals.validationPassed === true) {
    validation = 0.18;
    reasons.push("validation_passed");
  } else if (signals.validationPassed === false) {
    validation = 0;
    reasons.push("validation_failed");
  } else {
    validation = 0.04;
    reasons.push("validation_unknown");
  }

  if (signals.sonarPassed === true) {
    sonar = 0.1;
    reasons.push("sonar_passed");
  } else if (signals.sonarPassed === false) {
    sonar = 0;
    reasons.push("sonar_failed");
  } else {
    sonar = 0.03;
    reasons.push("sonar_unknown");
  }

  if (signals.coveragePassed === true) {
    coverage = 0.08;
    reasons.push("coverage_passed");
  } else if (signals.coveragePassed === false) {
    coverage = 0;
    reasons.push("coverage_failed");
  } else {
    coverage = 0.02;
    reasons.push("coverage_unknown");
  }

  if (signals.e2ePassed === true) {
    e2e = 0.12;
    reasons.push("e2e_passed");
  } else if (signals.e2ePassed === false) {
    e2e = 0;
    reasons.push("e2e_failed");
  } else {
    e2e = 0.03;
    reasons.push("e2e_unknown");
  }

  if (signals.hasPr) {
    delivery += 0.12;
    reasons.push("has_pr");
  }
  if (signals.hasDiffEvidence) {
    delivery += 0.08;
    reasons.push("has_diff");
  } else {
    criticPenalty -= 0.12;
    reasons.push("missing_diff");
  }

  const raw =
    ci + validation + delivery + criticPenalty + sonar + coverage + e2e;
  const score = Math.min(1, Math.max(0, raw));
  return {
    score,
    breakdown: {
      ci,
      validation,
      delivery,
      criticPenalty,
      sonar,
      coverage,
      e2e,
    },
    reasons,
  };
}

export async function collectCriticSignals(
  db: Database,
  run: AgentRun,
): Promise<CriticSignals> {
  const artifacts = await listArtifactsForRun(db, run.workspaceId, run.id);
  const events = await listRunEvents(db, run.id);

  let ciPassed: boolean | null = null;
  let validationPassed: boolean | null = null;
  let sonarPassed: boolean | null = null;
  let coveragePassed: boolean | null = null;
  let e2ePassed: boolean | null = null;
  let hasDiffEvidence = false;
  let blockingFailure = false;

  for (const art of artifacts) {
    if (art.kind === "validation_report" || art.kind === "ci_evidence") {
      try {
        const meta = art.meta ? JSON.parse(art.meta) : {};
        if (typeof meta.passed === "boolean") {
          if (art.kind === "validation_report") validationPassed = meta.passed;
          if (meta.passed) ciPassed = meta.passed;
          if (meta.passed === false && meta.blocksAccept) blockingFailure = true;
        }
        if (meta.inlineBody) {
          const body = JSON.parse(String(meta.inlineBody));
          if (typeof body.passed === "boolean") {
            validationPassed = body.passed;
            if (body.source === "github_check") ciPassed = body.passed;
            if (body.source === "sonar_quality_gate") {
              sonarPassed = body.passed;
              if (body.passed === false) blockingFailure = true;
            }
            if (body.source === "coverage_delta") {
              coveragePassed = body.passed;
              if (body.passed === false) blockingFailure = true;
            }
            if (body.source === "e2e") {
              e2ePassed = body.passed;
              if (body.passed === false) blockingFailure = true;
            }
            if (body.blocksAccept && body.passed === false) {
              blockingFailure = true;
            }
          }
        }
        if (meta.validator === "sonar-quality-gate-v1" && typeof meta.passed === "boolean") {
          sonarPassed = meta.passed;
          if (!meta.passed) blockingFailure = true;
        }
        if (
          typeof meta.validator === "string" &&
          meta.validator.includes("coverage") &&
          typeof meta.passed === "boolean"
        ) {
          coveragePassed = meta.passed;
          if (!meta.passed) blockingFailure = true;
        }
        if (
          typeof meta.validator === "string" &&
          meta.validator.startsWith("e2e-") &&
          typeof meta.passed === "boolean"
        ) {
          e2ePassed = meta.passed;
          if (!meta.passed) blockingFailure = true;
        }
      } catch {
        /* ignore malformed meta */
      }
    }
    if (art.kind === "diff_summary" || art.kind === "delivery_report") {
      hasDiffEvidence = true;
    }
  }

  for (const ev of events) {
    if (ev.kind !== "evidence") continue;
    try {
      const payload = JSON.parse(ev.payload);
      const ci = payload?.ci;
      if (ci && typeof ci.passed === "boolean") {
        ciPassed = ci.passed;
        if (ci.blocksAccept && !ci.passed) blockingFailure = true;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    ciPassed,
    validationPassed,
    hasPr: Boolean(run.prUrl || run.prNumber),
    hasDiffEvidence,
    blockingFailure,
    sonarPassed,
    coveragePassed,
    e2ePassed,
  };
}

function spendMicrosForRun(run: AgentRun): number {
  if (run.actualCostMicros > 0) return run.actualCostMicros;
  if (run.estimatedCostMicros > 0) return run.estimatedCostMicros;
  return run.spendCapMicros > 0 ? run.spendCapMicros : 0;
}

export async function persistContenderFitness(
  db: Database,
  input: {
    workspaceId: string;
    run: AgentRun;
    actor: string;
    score?: CriticScore;
    alpha?: number;
  },
): Promise<{
  run: AgentRun;
  score: CriticScore;
  efficiency: number;
  artifactId: string;
}> {
  const signals = await collectCriticSignals(db, input.run);
  const score = input.score ?? scoreWithRulesCritic(signals);
  const alpha = input.alpha ?? DEFAULT_PAYOFF_ALPHA;
  const spendMicros = spendMicrosForRun(input.run);
  const efficiency = computeEfficiencyPayoff({
    fitness: score.score,
    spendMicros,
    alpha,
    ciPassed: signals.ciPassed,
  });

  const artifact = await createArtifact(db, {
    workspaceId: input.run.workspaceId,
    projectId: input.run.projectId,
    taskId: input.run.taskId,
    runId: input.run.id,
    kind: "fitness_report",
    body: {
      scorer: "rules-critic-v1",
      signals,
      ...score,
      efficiency,
      spendMicros,
      alpha,
      mechanism: "efficiency_payoff",
    },
    meta: {
      scorer: "rules-critic-v1",
      score: score.score,
      efficiency,
      alpha,
      summary: score.reasons.join(","),
    },
  });

  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      fitnessScore: score.score,
      efficiencyScore: efficiency,
      fitnessEvidenceRef: artifact.id,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentRuns.id, input.run.id),
        eq(agentRuns.workspaceId, input.workspaceId),
      ),
    )
    .returning();

  if (!updated) throw new ArenaError("not_found", "run not found");

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "fitness.score",
    targetType: "run",
    targetId: input.run.id,
    meta: JSON.stringify({
      score: score.score,
      efficiency,
      spendMicros,
      alpha,
      artifactId: artifact.id,
      reasons: score.reasons,
    }),
  });

  return { run: updated, score, efficiency, artifactId: artifact.id };
}

/**
 * Score all ContenderRuns in a tournament, then promote the winner by efficiency.
 */
export async function scoreAndResolveTournament(
  db: Database,
  input: {
    workspaceId: string;
    tournamentId: string;
    actor: string;
  },
): Promise<{
  tournament: Tournament;
  winnerRunId: string;
  scores: Array<{ runId: string; score: number; efficiency: number }>;
}> {
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.id, input.tournamentId),
        eq(tournaments.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!tournament) throw new ArenaError("not_found", "tournament not found");

  const arena = await getArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: tournament.projectId,
  });
  const alpha = arena?.payoffAlpha ?? DEFAULT_PAYOFF_ALPHA;

  const runs = await listRunsForTournament(db, {
    workspaceId: input.workspaceId,
    tournamentId: input.tournamentId,
  });
  if (runs.length === 0) {
    throw new ArenaError("invalid", "tournament has no runs to score");
  }

  const scores: Array<{ runId: string; score: number; efficiency: number }> =
    [];
  for (const run of runs) {
    const { score, efficiency } = await persistContenderFitness(db, {
      workspaceId: input.workspaceId,
      run,
      actor: input.actor,
      alpha,
    });
    scores.push({ runId: run.id, score: score.score, efficiency });
  }

  const resolved = await resolveTournamentByFitness(db, {
    workspaceId: input.workspaceId,
    tournamentId: input.tournamentId,
    actor: input.actor,
  });

  // TASK051 — natural selection: losers lose contender budget.
  await debitTournamentLosers(db, {
    workspaceId: input.workspaceId,
    tournamentId: input.tournamentId,
    actor: input.actor,
  });

  return {
    tournament: resolved.tournament,
    winnerRunId: resolved.winnerRunId,
    scores,
  };
}

/**
 * TASK056 — if all ContenderRuns are terminal, score + resolve (idempotent).
 * Returns null when the tournament is not ready or already resolved by a peer.
 */
export async function maybeScoreAndResolveTournament(
  db: Database,
  input: {
    workspaceId: string;
    tournamentId: string;
    actor: string;
  },
): Promise<{
  tournament: Tournament;
  winnerRunId: string;
  scores: Array<{ runId: string; score: number; efficiency: number }>;
} | null> {
  const [tournament] = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.id, input.tournamentId),
        eq(tournaments.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!tournament) return null;
  if (tournament.status === "RESOLVED" || tournament.status === "CANCELLED") {
    return null;
  }

  const runs = await listRunsForTournament(db, {
    workspaceId: input.workspaceId,
    tournamentId: tournament.id,
  });
  if (runs.length === 0) return null;
  if (!runs.every((r) => isTerminalRunStatus(r.status))) return null;

  const { claimed, tournament: claimedTournament } =
    await claimTournamentForScoring(db, {
      workspaceId: input.workspaceId,
      tournamentId: tournament.id,
    });

  if (!claimed) {
    if (claimedTournament.status === "RESOLVED") return null;
    // Peer is scoring, or we raced; if still SCORING with all terminal, finish.
    if (claimedTournament.status !== "SCORING") return null;
  }

  try {
    return await scoreAndResolveTournament(db, {
      workspaceId: input.workspaceId,
      tournamentId: tournament.id,
      actor: input.actor,
    });
  } catch (err) {
    if (err instanceof ArenaError && err.code === "conflict") {
      return null;
    }
    throw err;
  }
}
