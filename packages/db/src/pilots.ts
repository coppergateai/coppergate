import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "./client.js";
import { countActiveHostedSubscriptions } from "./billing.js";
import {
  pilotInvites,
  workspaceSubscriptions,
  type PilotInvite,
} from "./schema.js";

export type PilotGoNoGoSnapshot = {
  invitesTotal: number;
  paidPilotInvites: number;
  paidPilotsRedeemed: number;
  activeHostedSubscriptions: number;
};

/** Newest-first invite list for ops dashboards. */
export async function listPilotInvites(db: Database): Promise<PilotInvite[]> {
  return db.select().from(pilotInvites).orderBy(desc(pilotInvites.createdAt));
}

/** Operator snapshot for GTM Phase 0 go/no-go. */
export async function getPilotGoNoGoSnapshot(
  db: Database,
): Promise<PilotGoNoGoSnapshot> {
  const invites = await db.select().from(pilotInvites);
  const paid = invites.filter(
    (i) =>
      i.kind === "paid_pilot" ||
      (i.note ?? "").toLowerCase().includes("paid_pilot"),
  );
  const paidRedeemed = paid.filter((i) => i.useCount > 0).length;
  const activeHosted = await countActiveHostedSubscriptions(db);

  return {
    invitesTotal: invites.length,
    paidPilotInvites: paid.length,
    paidPilotsRedeemed: paidRedeemed,
    activeHostedSubscriptions: activeHosted,
  };
}

/** Count workspaces with an active/trialing hosted plan. */
export async function listPayingWorkspaceIds(
  db: Database,
): Promise<string[]> {
  const rows = await db
    .select({ workspaceId: workspaceSubscriptions.workspaceId })
    .from(workspaceSubscriptions)
    .where(
      and(
        sql`${workspaceSubscriptions.status} in ('active', 'trialing')`,
        gt(sql`length(${workspaceSubscriptions.stripeSubscriptionId})`, 0),
      ),
    );
  return rows.map((r) => r.workspaceId);
}

export async function countPaidPilotInvites(db: Database): Promise<{
  created: number;
  redeemed: number;
}> {
  const paid = await db
    .select()
    .from(pilotInvites)
    .where(eq(pilotInvites.kind, "paid_pilot"));
  return {
    created: paid.length,
    redeemed: paid.filter((i) => i.useCount > 0).length,
  };
}
