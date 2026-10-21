import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  assertSufficientBudget,
  BudgetError,
  reserveEstimateForTask,
} from "./budgets.js";
import type { Database } from "./client.js";
import {
  clampTournamentFanout,
  resolveWorkspacePlanLimits,
} from "./plan-policy.js";
import { enqueueAgentRun } from "./runs.js";
import {
  agentRuns,
  arenas,
  auditEvents,
  contenders,
  projects,
  tasks,
  tournaments,
  type AgentRun,
  type Arena,
  type Contender,
  type Tournament,
} from "./schema.js";

/**
 * Hard-cap until TASK039 relaxes parallel-repo policy.
 * ContenderRuns still isolate via distinct run rows + branch names.
 */
/** Hard-cap raised with TASK039 (was 2). Independent tasks also parallelize. */
export const MAX_TOURNAMENT_FANOUT = 3;

/** Default spend exponent for efficiency payoff — GAME_THEORY.md */
export const DEFAULT_PAYOFF_ALPHA = 0.5;

export const CONTENDER_STRATEGIES = ["balanced", "blitz", "fortress"] as const;
export type ContenderStrategy = (typeof CONTENDER_STRATEGIES)[number];

export function isContenderStrategy(value: string): value is ContenderStrategy {
  return (CONTENDER_STRATEGIES as readonly string[]).includes(value);
}

export const TERMINAL_RUN_STATUSES = new Set([
  "REVIEW_REQUIRED",
  "FAILED",
  "CANCELLED",
]);

export function isTerminalRunStatus(status: string): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

export class ArenaError extends Error {
  readonly code:
    | "not_found"
    | "invalid"
    | "killed"
    | "eliminated"
    | "insufficient"
    | "conflict";

  constructor(code: ArenaError["code"], message: string) {
    super(message);
    this.name = "ArenaError";
    this.code = code;
  }
}

/** Pure: budgets never go negative. */
export function assertNonNegativeBudget(micros: number): void {
  if (!Number.isFinite(micros) || micros < 0) {
    throw new ArenaError("invalid", "budget must be a non-negative finite number");
  }
}

/** Pure: debit; returns remaining (floored at 0) and whether eliminated. */
export function debitContenderBudget(
  remainingMicros: number,
  debitMicros: number,
): { remainingMicros: number; eliminated: boolean } {
  assertNonNegativeBudget(remainingMicros);
  if (!Number.isFinite(debitMicros) || debitMicros < 0) {
    throw new ArenaError("invalid", "debit must be a non-negative finite number");
  }
  const next = Math.max(0, remainingMicros - debitMicros);
  return { remainingMicros: next, eliminated: next <= 0 };
}

export type FitnessCandidate = {
  runId: string;
  fitnessScore: number | null;
};

/** Pure: highest finite score wins; ties break by runId lexicographic for determinism. */
export function selectWinnerByFitness(
  candidates: FitnessCandidate[],
): FitnessCandidate {
  if (candidates.length === 0) {
    throw new ArenaError("invalid", "tournament has no candidates");
  }
  const scored = candidates.filter(
    (c) => c.fitnessScore != null && Number.isFinite(c.fitnessScore),
  );
  if (scored.length === 0) {
    throw new ArenaError("invalid", "no scored candidates");
  }
  return [...scored].sort((a, b) => {
    const diff = (b.fitnessScore as number) - (a.fitnessScore as number);
    if (diff !== 0) return diff;
    return a.runId.localeCompare(b.runId);
  })[0]!;
}

/** Floor spend (USD) so efficiency stays finite. */
const SPEND_USD_EPSILON = 1e-6;

/**
 * Mechanism payoff: e = f / spend_usd^α.
 * Hard gate: CI fail ⇒ 0 (token race cannot buy a green check).
 */
export function computeEfficiencyPayoff(input: {
  fitness: number;
  spendMicros: number;
  alpha?: number;
  ciPassed?: boolean | null;
}): number {
  if (input.ciPassed === false) return 0;
  const fitness = input.fitness;
  if (!Number.isFinite(fitness) || fitness < 0) return 0;
  const alpha =
    input.alpha != null && Number.isFinite(input.alpha)
      ? Math.max(0, input.alpha)
      : DEFAULT_PAYOFF_ALPHA;
  const spendUsd = Math.max(input.spendMicros / 1_000_000, SPEND_USD_EPSILON);
  const payoff = fitness / spendUsd ** alpha;
  return Number.isFinite(payoff) ? payoff : 0;
}

export type PayoffCandidate = {
  runId: string;
  efficiencyScore: number | null;
  fitnessScore: number | null;
};

/** Pure: highest efficiency wins; ties → higher fitness → lex runId. */
export function selectWinnerByPayoff(
  candidates: PayoffCandidate[],
): PayoffCandidate {
  if (candidates.length === 0) {
    throw new ArenaError("invalid", "tournament has no candidates");
  }
  const scored = candidates.filter(
    (c) => c.efficiencyScore != null && Number.isFinite(c.efficiencyScore),
  );
  if (scored.length === 0) {
    throw new ArenaError("invalid", "no scored candidates");
  }
  return [...scored].sort((a, b) => {
    const eDiff =
      (b.efficiencyScore as number) - (a.efficiencyScore as number);
    if (eDiff !== 0) return eDiff;
    const fA =
      a.fitnessScore != null && Number.isFinite(a.fitnessScore)
        ? a.fitnessScore
        : -1;
    const fB =
      b.fitnessScore != null && Number.isFinite(b.fitnessScore)
        ? b.fitnessScore
        : -1;
    if (fB !== fA) return fB - fA;
    return a.runId.localeCompare(b.runId);
  })[0]!;
}

/** Pure: at most one WINNER label in a result list. */
export function assertAtMostOneWinner(
  results: Array<"WINNER" | "LOSER" | "CANCELLED" | null | undefined>,
): void {
  const winners = results.filter((r) => r === "WINNER");
  if (winners.length > 1) {
    throw new ArenaError("conflict", "tournament cannot have multiple winners");
  }
}

export function canContenderEnqueue(input: {
  arenaStatus: string;
  contenderStatus: string;
  budgetMicrosRemaining: number;
}): boolean {
  if (input.arenaStatus === "KILLED" || input.arenaStatus === "PAUSED") {
    return false;
  }
  if (input.contenderStatus !== "ACTIVE") return false;
  return input.budgetMicrosRemaining > 0;
}

export async function getArenaForProject(
  db: Database,
  input: { workspaceId: string; projectId: string },
): Promise<Arena | null> {
  const [row] = await db
    .select()
    .from(arenas)
    .where(
      and(
        eq(arenas.workspaceId, input.workspaceId),
        eq(arenas.projectId, input.projectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function ensureArenaForProject(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    actor: string;
    minHuman?: boolean;
    defaultContenderN?: number;
    contenderBudgetMicros?: number;
    contenderCount?: number;
  },
): Promise<{ arena: Arena; contenders: Contender[]; created: boolean }> {
  const existing = await getArenaForProject(db, input);
  if (existing) {
    const pool = await listContendersForArena(db, {
      workspaceId: input.workspaceId,
      arenaId: existing.id,
    });
    return { arena: existing, contenders: pool, created: false };
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
    throw new ArenaError("not_found", "project not found");
  }

  const n = input.defaultContenderN ?? 2;
  if (!Number.isInteger(n) || n < 1 || n > 16) {
    throw new ArenaError("invalid", "defaultContenderN must be 1..16");
  }
  const contenderCount = input.contenderCount ?? n;
  const budgetEach = input.contenderBudgetMicros ?? 0;
  assertNonNegativeBudget(budgetEach);

  const arenaId = crypto.randomUUID();
  const now = new Date();
  const [arena] = await db
    .insert(arenas)
    .values({
      id: arenaId,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      minHuman: input.minHuman ?? true,
      prodWritesEnabled: false,
      defaultContenderN: n,
      status: "ARMED",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const pool: Contender[] = [];
  for (let i = 0; i < contenderCount; i++) {
    const strategy = CONTENDER_STRATEGIES[i % CONTENDER_STRATEGIES.length]!;
    const [c] = await db
      .insert(contenders)
      .values({
        id: crypto.randomUUID(),
        arenaId,
        workspaceId: input.workspaceId,
        profileKey: i === 0 ? "engineer" : `engineer_${i + 1}`,
        strategy,
        budgetMicrosRemaining: budgetEach,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    pool.push(c!);
  }

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.ensure",
    targetType: "arena",
    targetId: arenaId,
    meta: JSON.stringify({ projectId: input.projectId, n, contenderCount }),
  });

  return { arena: arena!, contenders: pool, created: true };
}

export async function listContendersForArena(
  db: Database,
  input: { workspaceId: string; arenaId: string },
): Promise<Contender[]> {
  return db
    .select()
    .from(contenders)
    .where(
      and(
        eq(contenders.workspaceId, input.workspaceId),
        eq(contenders.arenaId, input.arenaId),
      ),
    );
}

/** TASK053 — toggle min_human (default on after G1b 2026-10-12). */
export async function setArenaMinHuman(
  db: Database,
  input: {
    workspaceId: string;
    arenaId: string;
    minHuman: boolean;
    actor: string;
  },
): Promise<Arena> {
  const [arena] = await db
    .select()
    .from(arenas)
    .where(
      and(
        eq(arenas.id, input.arenaId),
        eq(arenas.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!arena) throw new ArenaError("not_found", "arena not found");

  const now = new Date();
  const [updated] = await db
    .update(arenas)
    .set({ minHuman: input.minHuman, updatedAt: now })
    .where(eq(arenas.id, arena.id))
    .returning();

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.min_human",
    targetType: "arena",
    targetId: arena.id,
    meta: JSON.stringify({ minHuman: input.minHuman }),
  });

  return updated!;
}

export async function applyContenderDebit(
  db: Database,
  input: {
    workspaceId: string;
    contenderId: string;
    debitMicros: number;
    actor: string;
  },
): Promise<Contender> {
  const [c] = await db
    .select()
    .from(contenders)
    .where(
      and(
        eq(contenders.id, input.contenderId),
        eq(contenders.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!c) throw new ArenaError("not_found", "contender not found");
  if (c.status === "ELIMINATED") {
    throw new ArenaError("eliminated", "contender already eliminated");
  }

  const { remainingMicros, eliminated } = debitContenderBudget(
    c.budgetMicrosRemaining,
    input.debitMicros,
  );
  const now = new Date();
  const [updated] = await db
    .update(contenders)
    .set({
      budgetMicrosRemaining: remainingMicros,
      status: eliminated ? "ELIMINATED" : c.status,
      eliminatedAt: eliminated ? now : c.eliminatedAt,
      updatedAt: now,
    })
    .where(eq(contenders.id, c.id))
    .returning();

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: eliminated ? "contender.eliminated" : "contender.debit",
    targetType: "contender",
    targetId: c.id,
    meta: JSON.stringify({
      debitMicros: input.debitMicros,
      remainingMicros,
    }),
  });

  return updated!;
}

export async function createTournament(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    arenaId: string;
    taskId: string;
    n: number;
    actor: string;
  },
): Promise<Tournament> {
  const [arena] = await db
    .select()
    .from(arenas)
    .where(
      and(
        eq(arenas.id, input.arenaId),
        eq(arenas.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!arena) throw new ArenaError("not_found", "arena not found");
  if (arena.status === "KILLED") {
    throw new ArenaError("killed", "arena is killed");
  }
  if (!Number.isInteger(input.n) || input.n < 1 || input.n > 16) {
    throw new ArenaError("invalid", "n must be 1..16");
  }

  const now = new Date();
  const [row] = await db
    .insert(tournaments)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      arenaId: input.arenaId,
      taskId: input.taskId,
      n: input.n,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db
    .update(arenas)
    .set({ status: "RUNNING", updatedAt: now })
    .where(eq(arenas.id, arena.id));

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "tournament.create",
    targetType: "tournament",
    targetId: row!.id,
    meta: JSON.stringify({ taskId: input.taskId, n: input.n }),
  });

  return row!;
}

export async function listRunsForTournament(
  db: Database,
  input: { workspaceId: string; tournamentId: string },
): Promise<AgentRun[]> {
  return db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.tournamentId, input.tournamentId),
      ),
    );
}

export async function getOpenTournamentForTask(
  db: Database,
  input: { workspaceId: string; taskId: string },
): Promise<Tournament | null> {
  const [row] = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.workspaceId, input.workspaceId),
        eq(tournaments.taskId, input.taskId),
        inArray(tournaments.status, ["OPEN", "SCORING"]),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** TASK054 — open tournament, else most recent for the task. */
export async function getLatestTournamentForTask(
  db: Database,
  input: { workspaceId: string; taskId: string },
): Promise<Tournament | null> {
  const open = await getOpenTournamentForTask(db, input);
  if (open) return open;

  const [latest] = await db
    .select()
    .from(tournaments)
    .where(
      and(
        eq(tournaments.workspaceId, input.workspaceId),
        eq(tournaments.taskId, input.taskId),
      ),
    )
    .orderBy(desc(tournaments.createdAt))
    .limit(1);
  return latest ?? null;
}

/**
 * TASK049 — spawn N ContenderRuns for a QUEUED task under an armed arena.
 * Idempotent: reuses an open tournament for the task when present.
 */
export async function startTournamentFanout(
  db: Database,
  input: {
    workspaceId: string;
    taskId: string;
    actor: string;
    /** Override width; clamped to MAX_TOURNAMENT_FANOUT and active pool. */
    n?: number;
    attempt?: number;
  },
): Promise<{
  arena: Arena;
  tournament: Tournament;
  runs: AgentRun[];
  created: boolean;
}> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!task) throw new ArenaError("not_found", "task not found");
  if (task.status !== "QUEUED" && task.status !== "RUNNING") {
    throw new ArenaError(
      "invalid",
      "Task must be QUEUED before tournament fan-out",
    );
  }

  const existingTournament = await getOpenTournamentForTask(db, {
    workspaceId: input.workspaceId,
    taskId: task.id,
  });
  if (existingTournament) {
    const arena = await getArenaForProject(db, {
      workspaceId: input.workspaceId,
      projectId: task.projectId,
    });
    if (!arena) throw new ArenaError("not_found", "arena not found");
    const runs = await listRunsForTournament(db, {
      workspaceId: input.workspaceId,
      tournamentId: existingTournament.id,
    });
    return {
      arena,
      tournament: existingTournament,
      runs,
      created: false,
    };
  }

  const { arena, contenders: pool } = await ensureArenaForProject(db, {
    workspaceId: input.workspaceId,
    projectId: task.projectId,
    actor: input.actor,
    defaultContenderN: MAX_TOURNAMENT_FANOUT,
    contenderCount: MAX_TOURNAMENT_FANOUT,
    contenderBudgetMicros: Math.max(task.estimateMicros ?? 0, 1),
  });
  if (arena.status === "KILLED" || arena.status === "PAUSED") {
    throw new ArenaError("killed", `arena is ${arena.status}`);
  }

  const eligible = pool.filter((c) =>
    canContenderEnqueue({
      arenaStatus: arena.status === "ARMED" ? "ARMED" : arena.status,
      contenderStatus: c.status,
      budgetMicrosRemaining: c.budgetMicrosRemaining,
    }),
  );
  const { plan } = await resolveWorkspacePlanLimits(db, input.workspaceId);
  const requested = input.n ?? arena.defaultContenderN;
  const planCapped = clampTournamentFanout(requested, plan);
  const n = Math.min(
    MAX_TOURNAMENT_FANOUT,
    Math.max(1, planCapped),
    eligible.length,
  );
  if (n < 1) {
    throw new ArenaError("eliminated", "no active contenders with budget");
  }

  const perRun = task.estimateMicros ?? 0;
  const totalReserve = perRun * n;
  try {
    await assertSufficientBudget(
      db,
      input.workspaceId,
      task.projectId,
      totalReserve,
    );
  } catch (err) {
    if (err instanceof BudgetError) {
      throw new ArenaError("insufficient", err.message);
    }
    throw err;
  }

  const selected = eligible.slice(0, n);
  const tournament = await createTournament(db, {
    workspaceId: input.workspaceId,
    projectId: task.projectId,
    arenaId: arena.id,
    taskId: task.id,
    n,
    actor: input.actor,
  });

  const attempt = input.attempt ?? task.attemptCount + 1;
  const runs: AgentRun[] = [];
  for (const contender of selected) {
    const shortT = tournament.id.slice(0, 8);
    const shortC = contender.id.slice(0, 8);
    const { run, created } = await enqueueAgentRun(db, {
      workspaceId: input.workspaceId,
      projectId: task.projectId,
      taskId: task.id,
      idempotencyKey: `tournament:${tournament.id}:contender:${contender.id}`,
      estimatedCostMicros: perRun,
      spendCapMicros: perRun,
      agentProfileKey: contender.profileKey,
      attempt,
      tournamentId: tournament.id,
      contenderId: contender.id,
      branchName: `cg/t/${shortT}/c/${shortC}`,
      baseSha: task.baseSha ?? undefined,
    });
    if (!created) {
      // Should not happen for a new tournament id; surface as conflict.
      throw new ArenaError("conflict", "contender run already exists");
    }
    // Isolation invariant: each ContenderRun owns a distinct branch namespace.
    if (
      runs.some(
        (r) => r.branchName != null && r.branchName === run.branchName,
      )
    ) {
      throw new ArenaError("conflict", "contender branch collision");
    }
    if (runs.some((r) => r.contenderId === run.contenderId)) {
      throw new ArenaError("conflict", "duplicate contender in fan-out");
    }
    runs.push(run);
  }

  await reserveEstimateForTask(db, {
    workspaceId: input.workspaceId,
    projectId: task.projectId,
    taskId: task.id,
    estimateMicros: totalReserve,
  });

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "tournament.fanout",
    targetType: "tournament",
    targetId: tournament.id,
    meta: JSON.stringify({
      taskId: task.id,
      n,
      runIds: runs.map((r) => r.id),
      maxFanout: MAX_TOURNAMENT_FANOUT,
    }),
  });

  return { arena, tournament, runs, created: true };
}

export async function resolveTournamentByFitness(
  db: Database,
  input: {
    workspaceId: string;
    tournamentId: string;
    actor: string;
  },
): Promise<{ tournament: Tournament; winnerRunId: string }> {
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
  if (tournament.status === "RESOLVED") {
    if (!tournament.winnerRunId) {
      throw new ArenaError("conflict", "resolved tournament missing winner");
    }
    return { tournament, winnerRunId: tournament.winnerRunId };
  }
  if (tournament.status === "CANCELLED") {
    throw new ArenaError("killed", "tournament cancelled");
  }

  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.tournamentId, tournament.id));

  const winner = selectWinnerByPayoff(
    runs.map((r) => ({
      runId: r.id,
      efficiencyScore: r.efficiencyScore,
      fitnessScore: r.fitnessScore,
    })),
  );

  const now = new Date();
  for (const run of runs) {
    const result = run.id === winner.runId ? "WINNER" : "LOSER";
    await db
      .update(agentRuns)
      .set({ tournamentResult: result, updatedAt: now })
      .where(eq(agentRuns.id, run.id));
  }

  assertAtMostOneWinner(
    runs.map((r) => (r.id === winner.runId ? "WINNER" : "LOSER")),
  );

  const [updated] = await db
    .update(tournaments)
    .set({
      status: "RESOLVED",
      winnerRunId: winner.runId,
      updatedAt: now,
    })
    .where(
      and(
        eq(tournaments.id, tournament.id),
        inArray(tournaments.status, ["OPEN", "SCORING"]),
      ),
    )
    .returning();

  if (!updated) {
    const [again] = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, tournament.id))
      .limit(1);
    if (again?.status === "RESOLVED" && again.winnerRunId) {
      return { tournament: again, winnerRunId: again.winnerRunId };
    }
    throw new ArenaError("conflict", "failed to resolve tournament");
  }

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "tournament.resolve",
    targetType: "tournament",
    targetId: tournament.id,
    meta: JSON.stringify({
      winnerRunId: winner.runId,
      mechanism: "efficiency_payoff",
      winnerEfficiency: winner.efficiencyScore,
      winnerFitness: winner.fitnessScore,
    }),
  });

  return { tournament: updated, winnerRunId: winner.runId };
}

/** Claim OPEN → SCORING for idempotent resolve (TASK056). */
export async function claimTournamentForScoring(
  db: Database,
  input: { workspaceId: string; tournamentId: string },
): Promise<{ claimed: boolean; tournament: Tournament }> {
  const now = new Date();
  const [claimed] = await db
    .update(tournaments)
    .set({ status: "SCORING", updatedAt: now })
    .where(
      and(
        eq(tournaments.id, input.tournamentId),
        eq(tournaments.workspaceId, input.workspaceId),
        eq(tournaments.status, "OPEN"),
      ),
    )
    .returning();
  if (claimed) return { claimed: true, tournament: claimed };

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
  return { claimed: false, tournament };
}

export async function getContenderById(
  db: Database,
  input: { workspaceId: string; contenderId: string },
): Promise<Contender | null> {
  const [row] = await db
    .select()
    .from(contenders)
    .where(
      and(
        eq(contenders.id, input.contenderId),
        eq(contenders.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Cancel open tournament runs for an arena (queued hard-cancel; inflight soft-cancel). */
async function freezeArenaOpenWork(
  db: Database,
  input: { workspaceId: string; arenaId: string; now: Date },
): Promise<void> {
  const openTournaments = await db
    .select({ id: tournaments.id })
    .from(tournaments)
    .where(eq(tournaments.arenaId, input.arenaId));
  const tournamentIds = openTournaments.map((t) => t.id);
  if (tournamentIds.length === 0) return;

  await db
    .update(tournaments)
    .set({ status: "CANCELLED", updatedAt: input.now })
    .where(
      and(
        eq(tournaments.arenaId, input.arenaId),
        inArray(tournaments.status, ["OPEN", "SCORING"]),
      ),
    );

  const activeRuns = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.workspaceId, input.workspaceId),
        inArray(agentRuns.tournamentId, tournamentIds),
      ),
    );
  const queuedIds = activeRuns
    .filter((r) => r.status === "QUEUED")
    .map((r) => r.id);
  const inflightIds = activeRuns
    .filter((r) => ["RUNNING", "VALIDATING"].includes(r.status))
    .map((r) => r.id);

  if (queuedIds.length > 0) {
    await db
      .update(agentRuns)
      .set({
        status: "CANCELLED",
        cancelRequestedAt: input.now,
        tournamentResult: "CANCELLED",
        finishedAt: input.now,
        updatedAt: input.now,
      })
      .where(inArray(agentRuns.id, queuedIds));
  }
  if (inflightIds.length > 0) {
    await db
      .update(agentRuns)
      .set({
        cancelRequestedAt: input.now,
        tournamentResult: "CANCELLED",
        updatedAt: input.now,
      })
      .where(inArray(agentRuns.id, inflightIds));
  }

  // Also freeze non-tournament solo runs on this project
  const [arena] = await db
    .select()
    .from(arenas)
    .where(eq(arenas.id, input.arenaId))
    .limit(1);
  if (!arena) return;
  const soloQueued = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, arena.projectId),
        eq(agentRuns.workspaceId, input.workspaceId),
        eq(agentRuns.status, "QUEUED"),
        isNull(agentRuns.tournamentId),
      ),
    );
  if (soloQueued.length > 0) {
    await db
      .update(agentRuns)
      .set({
        status: "CANCELLED",
        cancelRequestedAt: input.now,
        finishedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        inArray(
          agentRuns.id,
          soloQueued.map((r) => r.id),
        ),
      );
  }
  const soloInflight = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.projectId, arena.projectId),
        eq(agentRuns.workspaceId, input.workspaceId),
        inArray(agentRuns.status, ["RUNNING", "VALIDATING"]),
        isNull(agentRuns.tournamentId),
      ),
    );
  if (soloInflight.length > 0) {
    await db
      .update(agentRuns)
      .set({
        cancelRequestedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        inArray(
          agentRuns.id,
          soloInflight.map((r) => r.id),
        ),
      );
  }
}

/**
 * Soft stop — PAUSED. Freezes new fan-out/claims; REVIEW_REQUIRED work is kept
 * so Start can continue from where it left off.
 */
export async function pauseArena(
  db: Database,
  input: { workspaceId: string; arenaId: string; actor: string },
): Promise<Arena> {
  const [arena] = await db
    .select()
    .from(arenas)
    .where(
      and(
        eq(arenas.id, input.arenaId),
        eq(arenas.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!arena) throw new ArenaError("not_found", "arena not found");
  if (arena.status === "PAUSED") return arena;

  const now = new Date();
  const [updated] = await db
    .update(arenas)
    .set({ status: "PAUSED", updatedAt: now })
    .where(eq(arenas.id, arena.id))
    .returning();

  await freezeArenaOpenWork(db, {
    workspaceId: input.workspaceId,
    arenaId: arena.id,
    now,
  });

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.pause",
    targetType: "arena",
    targetId: arena.id,
    meta: JSON.stringify({ from: arena.status }),
  });

  return updated!;
}

export async function killArena(
  db: Database,
  input: { workspaceId: string; arenaId: string; actor: string },
): Promise<Arena> {
  const [arena] = await db
    .select()
    .from(arenas)
    .where(
      and(
        eq(arenas.id, input.arenaId),
        eq(arenas.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!arena) throw new ArenaError("not_found", "arena not found");

  const now = new Date();
  const [updated] = await db
    .update(arenas)
    .set({ status: "KILLED", killedAt: now, updatedAt: now })
    .where(eq(arenas.id, arena.id))
    .returning();

  await freezeArenaOpenWork(db, {
    workspaceId: input.workspaceId,
    arenaId: arena.id,
    now,
  });

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.kill",
    targetType: "arena",
    targetId: arena.id,
    meta: JSON.stringify({}),
  });

  return updated!;
}

/** Re-arm a killed/paused arena so fan-out can run again (TASK052). */
export async function resumeArena(
  db: Database,
  input: { workspaceId: string; arenaId: string; actor: string },
): Promise<Arena> {
  const [arena] = await db
    .select()
    .from(arenas)
    .where(
      and(
        eq(arenas.id, input.arenaId),
        eq(arenas.workspaceId, input.workspaceId),
      ),
    )
    .limit(1);
  if (!arena) throw new ArenaError("not_found", "arena not found");
  if (arena.status !== "KILLED" && arena.status !== "PAUSED") {
    throw new ArenaError(
      "invalid",
      `arena status ${arena.status} cannot resume`,
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(arenas)
    .set({
      status: "RUNNING",
      killedAt: null,
      updatedAt: now,
    })
    .where(eq(arenas.id, arena.id))
    .returning();

  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actor: input.actor,
    action: "arena.resume",
    targetType: "arena",
    targetId: arena.id,
    meta: JSON.stringify({ from: arena.status }),
  });

  return updated!;
}

/**
 * TASK051 — debit loser contenders after resolve (actual or estimated spend).
 * Winner is not debited here (project ledger already reserved fan-out total).
 */
export async function debitTournamentLosers(
  db: Database,
  input: {
    workspaceId: string;
    tournamentId: string;
    actor: string;
  },
): Promise<Contender[]> {
  const runs = await listRunsForTournament(db, {
    workspaceId: input.workspaceId,
    tournamentId: input.tournamentId,
  });
  const losers = runs.filter((r) => r.tournamentResult === "LOSER");
  const updated: Contender[] = [];
  for (const run of losers) {
    if (!run.contenderId) continue;
    const debit =
      run.actualCostMicros > 0
        ? run.actualCostMicros
        : run.estimatedCostMicros > 0
          ? run.estimatedCostMicros
          : run.spendCapMicros;
    if (debit <= 0) continue;
    try {
      const c = await applyContenderDebit(db, {
        workspaceId: input.workspaceId,
        contenderId: run.contenderId,
        debitMicros: debit,
        actor: input.actor,
      });
      updated.push(c);
    } catch (err) {
      if (err instanceof ArenaError && err.code === "eliminated") {
        continue;
      }
      throw err;
    }
  }
  return updated;
}
