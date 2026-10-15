import { and, desc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { auditEvents, type AuditEvent } from "./schema.js";

export type ListAuditOptions = {
  limit?: number;
  /** ISO timestamp cursor — return events strictly older than this */
  before?: string | null;
};

export async function listAuditEventsForWorkspace(
  db: Database,
  workspaceId: string,
  options: ListAuditOptions = {},
): Promise<AuditEvent[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const conditions = [eq(auditEvents.workspaceId, workspaceId)];

  if (options.before) {
    const beforeDate = new Date(options.before);
    if (Number.isFinite(beforeDate.getTime())) {
      conditions.push(lt(auditEvents.createdAt, beforeDate));
    }
  }

  return db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

export async function countAuditEventsForWorkspace(
  db: Database,
  workspaceId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(eq(auditEvents.workspaceId, workspaceId));
  return row?.count ?? 0;
}
