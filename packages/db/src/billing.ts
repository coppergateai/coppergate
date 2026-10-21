import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "./client.js";
import {
  workspaceSubscriptions,
  type BillingPlan,
  type SubscriptionStatus,
  type WorkspaceSubscription,
} from "./schema.js";

export class BillingError extends Error {
  readonly code: "not_configured" | "not_found" | "invalid";
  constructor(code: BillingError["code"], message: string) {
    super(message);
    this.name = "BillingError";
    this.code = code;
  }
}

export function normalizeBillingPlan(raw: string | null | undefined): BillingPlan {
  if (raw === "starter" || raw === "pro" || raw === "team") return raw;
  return "community";
}

export function normalizeSubscriptionStatus(
  raw: string | null | undefined,
): SubscriptionStatus {
  if (
    raw === "active" ||
    raw === "past_due" ||
    raw === "canceled" ||
    raw === "trialing" ||
    raw === "incomplete"
  ) {
    return raw;
  }
  // Stripe unpaid / incomplete_expired → treat as past_due for plan gating.
  if (raw === "unpaid" || raw === "incomplete_expired") {
    return "past_due";
  }
  return "incomplete";
}

export async function getWorkspaceSubscription(
  db: Database,
  workspaceId: string,
): Promise<WorkspaceSubscription | null> {
  const [row] = await db
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

export type UpsertSubscriptionInput = {
  workspaceId: string;
  plan: BillingPlan;
  status: SubscriptionStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
};

/** Insert or update subscription row for a workspace. */
export async function upsertWorkspaceSubscription(
  db: Database,
  input: UpsertSubscriptionInput,
): Promise<WorkspaceSubscription> {
  const existing = await getWorkspaceSubscription(db, input.workspaceId);
  const now = new Date();
  if (existing) {
    const [row] = await db
      .update(workspaceSubscriptions)
      .set({
        plan: input.plan,
        status: input.status,
        stripeCustomerId:
          input.stripeCustomerId !== undefined
            ? input.stripeCustomerId
            : existing.stripeCustomerId,
        stripeSubscriptionId:
          input.stripeSubscriptionId !== undefined
            ? input.stripeSubscriptionId
            : existing.stripeSubscriptionId,
        stripePriceId:
          input.stripePriceId !== undefined
            ? input.stripePriceId
            : existing.stripePriceId,
        currentPeriodEnd:
          input.currentPeriodEnd !== undefined
            ? input.currentPeriodEnd
            : existing.currentPeriodEnd,
        cancelAtPeriodEnd:
          input.cancelAtPeriodEnd ?? existing.cancelAtPeriodEnd,
        updatedAt: now,
      })
      .where(eq(workspaceSubscriptions.id, existing.id))
      .returning();
    if (!row) throw new BillingError("not_found", "Failed to update subscription");
    return row;
  }

  const [row] = await db
    .insert(workspaceSubscriptions)
    .values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      plan: input.plan,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      stripePriceId: input.stripePriceId ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new BillingError("not_found", "Failed to create subscription");
  return row;
}

export async function findSubscriptionByStripeCustomer(
  db: Database,
  stripeCustomerId: string,
): Promise<WorkspaceSubscription | null> {
  const [row] = await db
    .select()
    .from(workspaceSubscriptions)
    .where(eq(workspaceSubscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return row ?? null;
}

export async function countActiveHostedSubscriptions(
  db: Database,
): Promise<number> {
  const rows = await db
    .select({
      id: workspaceSubscriptions.id,
      status: workspaceSubscriptions.status,
      stripeSubscriptionId: workspaceSubscriptions.stripeSubscriptionId,
    })
    .from(workspaceSubscriptions);
  return rows.filter(
    (r) =>
      (r.status === "active" || r.status === "trialing") &&
      Boolean(r.stripeSubscriptionId),
  ).length;
}

/** Effective plan: active/trialing hosted, else community. */
export function effectivePlan(
  sub: WorkspaceSubscription | null,
): BillingPlan {
  if (!sub) return "community";
  if (sub.status === "active" || sub.status === "trialing") {
    return normalizeBillingPlan(sub.plan);
  }
  return "community";
}
