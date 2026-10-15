import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  auditEvents,
  signalEvents,
  usageEvents,
} from "./schema.js";

export type SpendBySignalRow = {
  provider: string;
  signalCount: number;
  armedCount: number;
  /** Best-effort: usage attributed via signal→task scope in window. */
  spendMicros: number;
};

/** TASK109 — spend / volume by signal provider. */
export async function getSpendBySignalSource(
  db: Database,
  input: { workspaceId: string; days?: number },
): Promise<{
  windowDays: number;
  rows: SpendBySignalRow[];
  totalSignals: number;
  totalArmed: number;
}> {
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const signals = await db
    .select()
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.workspaceId, input.workspaceId),
        gte(signalEvents.receivedAt, since),
      ),
    );

  const byProvider = new Map<
    string,
    { signalCount: number; armedCount: number; taskIds: Set<string> }
  >();
  for (const s of signals) {
    const row = byProvider.get(s.provider) ?? {
      signalCount: 0,
      armedCount: 0,
      taskIds: new Set<string>(),
    };
    row.signalCount += 1;
    if (s.status === "armed") row.armedCount += 1;
    if (s.taskId) row.taskIds.add(s.taskId);
    byProvider.set(s.provider, row);
  }

  const usage = await db
    .select({
      taskId: usageEvents.taskId,
      cost: usageEvents.costMicros,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, input.workspaceId),
        gte(usageEvents.createdAt, since),
      ),
    );

  const costByTask = new Map<string, number>();
  for (const u of usage) {
    if (!u.taskId) continue;
    costByTask.set(u.taskId, (costByTask.get(u.taskId) ?? 0) + (u.cost || 0));
  }

  const rows: SpendBySignalRow[] = [...byProvider.entries()].map(
    ([provider, v]) => {
      let spendMicros = 0;
      for (const tid of v.taskIds) {
        spendMicros += costByTask.get(tid) ?? 0;
      }
      return {
        provider,
        signalCount: v.signalCount,
        armedCount: v.armedCount,
        spendMicros,
      };
    },
  );
  rows.sort((a, b) => b.spendMicros - a.spendMicros || b.signalCount - a.signalCount);

  return {
    windowDays: days,
    rows,
    totalSignals: signals.length,
    totalArmed: signals.filter((s) => s.status === "armed").length,
  };
}

/** TASK110 — sync audit + signal export for date range (owner). */
export async function exportWorkspaceAuditBundle(
  db: Database,
  input: {
    workspaceId: string;
    from: Date;
    to: Date;
    limit?: number;
  },
): Promise<{
  exportedAt: string;
  from: string;
  to: string;
  audits: Array<{
    id: string;
    actor: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    meta: string | null;
    createdAt: string;
  }>;
  signals: Array<{
    id: string;
    provider: string;
    externalId: string;
    severity: string;
    title: string;
    status: string;
    taskId: string | null;
    receivedAt: string;
  }>;
}> {
  const limit = Math.min(input.limit ?? 5000, 20_000);
  const audits = await db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.workspaceId, input.workspaceId),
        gte(auditEvents.createdAt, input.from),
        sql`${auditEvents.createdAt} <= ${input.to}`,
      ),
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  const signals = await db
    .select()
    .from(signalEvents)
    .where(
      and(
        eq(signalEvents.workspaceId, input.workspaceId),
        gte(signalEvents.receivedAt, input.from),
        sql`${signalEvents.receivedAt} <= ${input.to}`,
      ),
    )
    .orderBy(desc(signalEvents.receivedAt))
    .limit(limit);

  return {
    exportedAt: new Date().toISOString(),
    from: input.from.toISOString(),
    to: input.to.toISOString(),
    audits: audits.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      meta: a.meta,
      createdAt: a.createdAt.toISOString(),
    })),
    signals: signals.map((s) => ({
      id: s.id,
      provider: s.provider,
      externalId: s.externalId,
      severity: s.severity,
      title: s.title,
      status: s.status,
      taskId: s.taskId,
      receivedAt: s.receivedAt.toISOString(),
    })),
  };
}
