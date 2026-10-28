import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client.js";
import { auditEvents, type AuditEvent, type Contender } from "./schema.js";

export const CONTENDER_BUDGET_LEDGER_ACTIONS = [
  "contender.debit",
  "contender.eliminated",
] as const;

export type ContenderBudgetLedgerAction =
  (typeof CONTENDER_BUDGET_LEDGER_ACTIONS)[number];

export type ArenaContenderPoolSummary = {
  /** ACTIVE with budget remaining — can enqueue when arena is live. */
  activeWithBudget: number;
  /** Budget exhausted (status ELIMINATED). */
  eliminated: number;
  /** ACTIVE but broke (should be rare after debit). */
  activeBroke: number;
  total: number;
};

export type FanoutPoolHonesty = {
  requestedFanout: number;
  actualFanout: number;
  eligibleCount: number;
  eliminatedInPool: number;
  /** Fan-out width reduced because the live pool could not fill requested N. */
  poolStarved: boolean;
  poolStarvedReason: "contenders" | "concurrency" | "budget" | null;
};

/** Summarize roster for operator honesty (Survivor selection ≠ hidden history). */
export function summarizeArenaContenderPool(
  pool: Contender[],
): ArenaContenderPoolSummary {
  let activeWithBudget = 0;
  let eliminated = 0;
  let activeBroke = 0;
  for (const c of pool) {
    if (c.status === "ELIMINATED") {
      eliminated += 1;
      continue;
    }
    if (c.status === "ACTIVE" && c.budgetMicrosRemaining > 0) {
      activeWithBudget += 1;
    } else if (c.status === "ACTIVE") {
      activeBroke += 1;
    }
  }
  return {
    activeWithBudget,
    eliminated,
    activeBroke,
    total: pool.length,
  };
}

/** Pure: explain tournament fan-out width vs requested (stored on audit meta). */
export function describeFanoutPoolHonesty(input: {
  requestedFanout: number;
  actualFanout: number;
  eligibleCount: number;
  eliminatedInPool: number;
  concurrencySlots: number;
  availableMicros: number;
  perRunMicros: number;
}): FanoutPoolHonesty {
  const requestedFanout = Math.max(0, Math.floor(input.requestedFanout));
  const actualFanout = Math.max(0, Math.floor(input.actualFanout));
  const eligibleCount = Math.max(0, Math.floor(input.eligibleCount));
  const eliminatedInPool = Math.max(0, Math.floor(input.eliminatedInPool));

  let poolStarvedReason: FanoutPoolHonesty["poolStarvedReason"] = null;
  if (actualFanout < requestedFanout) {
    if (eligibleCount < requestedFanout) {
      poolStarvedReason = "contenders";
    } else if (input.concurrencySlots < requestedFanout) {
      poolStarvedReason = "concurrency";
    } else if (
      input.perRunMicros > 0 &&
      Math.floor(Math.max(0, input.availableMicros) / input.perRunMicros) <
        requestedFanout
    ) {
      poolStarvedReason = "budget";
    } else {
      poolStarvedReason = "contenders";
    }
  }

  return {
    requestedFanout,
    actualFanout,
    eligibleCount,
    eliminatedInPool,
    poolStarved: actualFanout < requestedFanout,
    poolStarvedReason,
  };
}

export function contenderDebitAuditMeta(
  contender: Pick<Contender, "profileKey" | "arenaId">,
  input: { debitMicros: number; remainingMicros: number; eliminated: boolean },
): Record<string, unknown> {
  return {
    profileKey: contender.profileKey,
    arenaId: contender.arenaId,
    debitMicros: input.debitMicros,
    remainingMicros: input.remainingMicros,
    eliminated: input.eliminated,
  };
}

export type ContenderBudgetLedgerEntry = {
  id: string;
  action: ContenderBudgetLedgerAction;
  debitMicros: number | null;
  remainingMicros: number | null;
  profileKey: string | null;
  createdAt: string;
};

function parseLedgerMeta(raw: string | null): {
  debitMicros: number | null;
  remainingMicros: number | null;
  profileKey: string | null;
} {
  if (!raw) {
    return { debitMicros: null, remainingMicros: null, profileKey: null };
  }
  try {
    const meta = JSON.parse(raw) as Record<string, unknown>;
    const debitMicros =
      typeof meta.debitMicros === "number" && Number.isFinite(meta.debitMicros)
        ? meta.debitMicros
        : null;
    const remainingMicros =
      typeof meta.remainingMicros === "number" &&
      Number.isFinite(meta.remainingMicros)
        ? meta.remainingMicros
        : null;
    const profileKey =
      typeof meta.profileKey === "string" && meta.profileKey.trim()
        ? meta.profileKey
        : null;
    return { debitMicros, remainingMicros, profileKey };
  } catch {
    return { debitMicros: null, remainingMicros: null, profileKey: null };
  }
}

/** Immutable contender budget ledger — audit-backed debits and eliminations. */
export async function listContenderBudgetLedger(
  db: Database,
  input: {
    workspaceId: string;
    contenderId: string;
    limit?: number;
  },
): Promise<ContenderBudgetLedgerEntry[]> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, input.workspaceId),
        eq(auditEvents.targetType, "contender"),
        eq(auditEvents.targetId, input.contenderId),
        inArray(auditEvents.action, [...CONTENDER_BUDGET_LEDGER_ACTIONS]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return rows.map((row) => mapLedgerRow(row));
}

export async function listArenaContenderBudgetLedger(
  db: Database,
  input: {
    workspaceId: string;
    contenderIds: string[];
    limit?: number;
  },
): Promise<ContenderBudgetLedgerEntry[]> {
  if (input.contenderIds.length === 0) return [];
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, input.workspaceId),
        eq(auditEvents.targetType, "contender"),
        inArray(auditEvents.targetId, input.contenderIds),
        inArray(auditEvents.action, [...CONTENDER_BUDGET_LEDGER_ACTIONS]),
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  return rows.map((row) => mapLedgerRow(row));
}

function mapLedgerRow(row: AuditEvent): ContenderBudgetLedgerEntry {
  const parsed = parseLedgerMeta(row.meta);
  const action = row.action as ContenderBudgetLedgerAction;
  return {
    id: row.id,
    action,
    debitMicros: parsed.debitMicros,
    remainingMicros: parsed.remainingMicros,
    profileKey: parsed.profileKey,
    createdAt: row.createdAt.toISOString(),
  };
}
