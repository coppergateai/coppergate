import { and, eq } from "drizzle-orm";
import {
  ArenaError,
  debitTournamentLosers,
  listRunsForTournament,
  resolveTournamentByFitness,
} from "./arena.js";
import { createArtifact, listArtifactsForRun } from "./artifacts.js";
import type { Database } from "./client.js";
import { listRunEvents } from "./run-events.js";
import { agentRuns, auditEvents, type AgentRun, type Tournament } from "./schema.js";

export type CriticSignals = {
  ciPassed: boolean | null;
  validationPassed: boolean | null;
  hasPr: boolean;
  hasDiffEvidence: boolean;
  blockingFailure: boolean;
};

export type CriticScore = {
  score: number;
  breakdown: {
    ci: number;
    validation: number;
    delivery: number;
    criticPenalty: number;
  };
  reasons: string[];
};

/** Rules-based critic (TASK050). LLM critic can wrap the same score shape later. */
export function scoreWithRulesCritic(signals: CriticSignals): CriticScore {
  const reasons: string[] = [];
  let ci = 0;
  let validation = 0;
  let delivery = 0;
  let criticPenalty = 0;

  if (signals.blockingFailure) {
    criticPenalty -= 0.5;
    reasons.push("blocking_failure");
  }

  if (signals.ciPassed === true) {
    ci = 0.45;
    reasons.push("ci_passed");
  } else if (signals.ciPassed === false) {
    ci = 0;
    reasons.push("ci_failed");
  } else {
    ci = 0.1;
    reasons.push("ci_unknown");
  }

  if (signals.validationPassed === true) {
    validation = 0.3;
    reasons.push("validation_passed");
  } else if (signals.validationPassed === false) {
    validation = 0;
    reasons.push("validation_failed");
  } else {
    validation = 0.05;
    reasons.push("validation_unknown");
  }

  if (signals.hasPr) {
    delivery += 0.15;
    reasons.push("has_pr");
  }
  if (signals.hasDiffEvidence) {
    delivery += 0.1;
    reasons.push("has_diff");
  } else {
    criticPenalty -= 0.15;
    reasons.push("missing_diff");
  }

  const raw = ci + validation + delivery + criticPenalty;
  const score = Math.min(1, Math.max(0, raw));
  return {
    score,
    breakdown: { ci, validation, delivery, criticPenalty },
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
            if (body.blocksAccept && body.passed === false) {
              blockingFailure = true;
            }
          }
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
  };
}

export async function persistContenderFitness(
  db: Database,
  input: {
    workspaceId: string;
    run: AgentRun;
    actor: string;
    score?: CriticScore;
  },
): Promise<{ run: AgentRun; score: CriticScore; artifactId: string }> {
  const signals = await collectCriticSignals(db, input.run);
  const score = input.score ?? scoreWithRulesCritic(signals);
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
    },
    meta: {
      scorer: "rules-critic-v1",
      score: score.score,
      summary: score.reasons.join(","),
    },
  });

  const now = new Date();
  const [updated] = await db
    .update(agentRuns)
    .set({
      fitnessScore: score.score,
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
      artifactId: artifact.id,
      reasons: score.reasons,
    }),
  });

  return { run: updated, score, artifactId: artifact.id };
}

/**
 * Score all ContenderRuns in a tournament, then promote the winner.
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
  scores: Array<{ runId: string; score: number }>;
}> {
  const runs = await listRunsForTournament(db, {
    workspaceId: input.workspaceId,
    tournamentId: input.tournamentId,
  });
  if (runs.length === 0) {
    throw new ArenaError("invalid", "tournament has no runs to score");
  }

  const scores: Array<{ runId: string; score: number }> = [];
  for (const run of runs) {
    const { score } = await persistContenderFitness(db, {
      workspaceId: input.workspaceId,
      run,
      actor: input.actor,
    });
    scores.push({ runId: run.id, score: score.score });
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
