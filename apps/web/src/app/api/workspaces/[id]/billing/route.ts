import {
  createStripeClient,
  createBillingPortalSession,
  createCheckoutSession,
  HOSTED_PLANS,
  limitsForPlan,
  reportUsageSummaryToStripe,
  type HostedPlanId,
} from "@coppergate/billing";
import {
  effectivePlan,
  getWorkspaceMonthToDateUsage,
  getWorkspaceSubscription,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";
import { trackFunnelEvent } from "@coppergate/telemetry";
import { requireUser } from "@/lib/auth";
import { getStripeBillingConfig } from "@/lib/billing";
import { requireCsrf } from "@/lib/csrf";
import { db } from "@/lib/db";
import { correlationIdFrom, jsonError, jsonOk } from "@/lib/http";
import { logger } from "@/lib/logger";
import { requireWorkspaceMember, requireWorkspaceOwner } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET subscription status + plan catalog for workspace. */
export async function GET(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceMember(db, workspaceId, user.id);

    const cfg = getStripeBillingConfig();
    const sub = await getWorkspaceSubscription(db, workspaceId);
    const plan = effectivePlan(sub);
    const usage = await getWorkspaceMonthToDateUsage(db, workspaceId);

    if (
      cfg &&
      sub?.stripeCustomerId &&
      (plan === "starter" || plan === "pro" || plan === "team")
    ) {
      const stripe = createStripeClient(cfg.secretKey);
      void reportUsageSummaryToStripe({
        stripe,
        customerId: sub.stripeCustomerId,
        workspaceId,
        periodLabel: usage.periodLabel,
        spentMicros: usage.spentMicros,
        eventCount: usage.eventCount,
      }).catch(() => undefined);
    }

    return jsonOk(
      {
        configured: !!cfg,
        plan,
        limits: limitsForPlan(plan),
        usage,
        subscription: sub
          ? {
              plan: sub.plan,
              status: sub.status,
              currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              hasCustomer: !!sub.stripeCustomerId,
              paymentFailed:
                sub.status === "past_due" || sub.status === "unpaid",
            }
          : null,
        plans: HOSTED_PLANS,
      },
      { correlationId },
    );
  } catch (err) {
    return jsonError(err, correlationId);
  }
}

type CheckoutBody = {
  action?: "checkout" | "portal";
  plan?: string;
};

/** POST checkout session or billing portal. */
export async function POST(request: Request, context: RouteContext) {
  const correlationId = correlationIdFrom(request);
  try {
    requireCsrf(request);
    const user = await requireUser(request);
    const { id: workspaceId } = await context.params;
    await requireWorkspaceOwner(db, workspaceId, user.id);

    const cfg = getStripeBillingConfig();
    if (!cfg) {
      throw new ApiError(
        "bad_request",
        "Hosted billing is not configured — set STRIPE_* env vars",
      );
    }

    const body = (await request.json()) as CheckoutBody;
    const stripe = createStripeClient(cfg.secretKey);
    const sub = await getWorkspaceSubscription(db, workspaceId);

    if (body.action === "portal") {
      if (!sub?.stripeCustomerId) {
        throw new ApiError(
          "bad_request",
          "No Stripe customer yet — start a checkout first",
        );
      }
      const session = await createBillingPortalSession({
        stripe,
        cfg,
        customerId: sub.stripeCustomerId,
        workspaceId,
      });
      return jsonOk({ url: session.url }, { correlationId });
    }

    const plan = body.plan === "pro" ? "pro" : body.plan === "starter" ? "starter" : null;
    if (!plan) {
      throw new ApiError("bad_request", "plan must be starter or pro");
    }

    const session = await createCheckoutSession({
      stripe,
      cfg,
      workspaceId,
      plan: plan as HostedPlanId,
      customerEmail: user.email ?? undefined,
      existingCustomerId: sub?.stripeCustomerId,
    });

    trackFunnelEvent(logger, {
      stage: "paid_pilot_started",
      workspaceId,
      userId: user.id,
      meta: { plan, correlationId },
    });

    return jsonOk({ url: session.url, sessionId: session.id }, { correlationId });
  } catch (err) {
    return jsonError(err, correlationId);
  }
}
