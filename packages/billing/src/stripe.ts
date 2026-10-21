import Stripe from "stripe";
import {
  findSubscriptionByStripeCustomer,
  normalizeBillingPlan,
  normalizeSubscriptionStatus,
  upsertWorkspaceSubscription,
  type BillingPlan,
  type Database,
  type SubscriptionStatus,
} from "@coppergate/db";
import { planFromPriceId, type HostedPlanId } from "./plans.js";

export type StripeBillingConfig = {
  secretKey: string;
  webhookSecret: string;
  priceStarter: string;
  pricePro: string;
  appUrl: string;
};

export function isStripeConfigured(cfg: Partial<StripeBillingConfig>): boolean {
  return Boolean(
    cfg.secretKey &&
      cfg.webhookSecret &&
      cfg.priceStarter &&
      cfg.pricePro &&
      cfg.appUrl,
  );
}

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
}

export function priceIdForPlan(
  plan: HostedPlanId,
  cfg: Pick<StripeBillingConfig, "priceStarter" | "pricePro">,
): string {
  return plan === "pro" ? cfg.pricePro : cfg.priceStarter;
}

export async function createCheckoutSession(input: {
  stripe: Stripe;
  cfg: StripeBillingConfig;
  workspaceId: string;
  plan: HostedPlanId;
  customerEmail?: string | null;
  existingCustomerId?: string | null;
}): Promise<Stripe.Checkout.Session> {
  const price = priceIdForPlan(input.plan, input.cfg);
  return input.stripe.checkout.sessions.create({
    mode: "subscription",
    customer: input.existingCustomerId ?? undefined,
    customer_email: input.existingCustomerId
      ? undefined
      : (input.customerEmail ?? undefined),
    line_items: [{ price, quantity: 1 }],
    success_url: `${input.cfg.appUrl}/workspaces/${input.workspaceId}/settings?tab=billing&checkout=success`,
    cancel_url: `${input.cfg.appUrl}/workspaces/${input.workspaceId}/settings?tab=billing&checkout=cancel`,
    metadata: {
      workspaceId: input.workspaceId,
      plan: input.plan,
    },
    subscription_data: {
      metadata: {
        workspaceId: input.workspaceId,
        plan: input.plan,
        usage_billing:
          "Month-to-date usage synced to customer metadata; metered price optional via STRIPE_PRICE_USAGE",
      },
    },
    allow_promotion_codes: true,
  });
}

export async function createBillingPortalSession(input: {
  stripe: Stripe;
  cfg: StripeBillingConfig;
  customerId: string;
  workspaceId: string;
}): Promise<Stripe.BillingPortal.Session> {
  return input.stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: `${input.cfg.appUrl}/workspaces/${input.workspaceId}/settings?tab=billing`,
  });
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  return normalizeSubscriptionStatus(status);
}

function subscriptionPlan(
  sub: Stripe.Subscription,
  cfg: Pick<StripeBillingConfig, "priceStarter" | "pricePro">,
): BillingPlan {
  const priceId = sub.items.data[0]?.price?.id;
  const fromPrice = planFromPriceId(priceId, {
    starter: cfg.priceStarter,
    pro: cfg.pricePro,
  });
  if (fromPrice) return fromPrice;
  const meta = sub.metadata?.plan;
  return normalizeBillingPlan(meta);
}

/** Apply a Stripe subscription object onto the workspace row. */
export async function syncSubscriptionFromStripe(
  db: Database,
  cfg: Pick<StripeBillingConfig, "priceStarter" | "pricePro">,
  sub: Stripe.Subscription,
  workspaceIdHint?: string | null,
): Promise<void> {
  const workspaceId =
    workspaceIdHint ||
    sub.metadata?.workspaceId ||
    (
      await findSubscriptionByStripeCustomer(
        db,
        typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      )
    )?.workspaceId;

  if (!workspaceId) {
    throw new Error("stripe_subscription_missing_workspace");
  }

  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  await upsertWorkspaceSubscription(db, {
    workspaceId,
    plan: subscriptionPlan(sub, cfg),
    status: mapStripeStatus(sub.status),
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    stripePriceId: priceId,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  });
}

/**
 * Minimum usage trust for hosted plans: attach month-to-date spend as a
 * Stripe customer invoice note (or subscription metadata). Full metered
 * billing can replace this when STRIPE_PRICE_USAGE is configured.
 */
export async function reportUsageSummaryToStripe(input: {
  stripe: Stripe;
  customerId: string;
  workspaceId: string;
  periodLabel: string;
  spentMicros: number;
  eventCount: number;
}): Promise<{ ok: boolean; mode: "metadata" | "skipped"; detail?: string }> {
  const spentUsd = (input.spentMicros / 1_000_000).toFixed(4);
  const note = `Coppergate usage ${input.periodLabel}: $${spentUsd} (${input.eventCount} events) ws=${input.workspaceId}`;
  try {
    await input.stripe.customers.update(input.customerId, {
      metadata: {
        coppergate_usage_period: input.periodLabel,
        coppergate_usage_usd: spentUsd,
        coppergate_usage_events: String(input.eventCount),
        coppergate_usage_note: note.slice(0, 500),
      },
    });
    return { ok: true, mode: "metadata" };
  } catch (err) {
    return {
      ok: false,
      mode: "skipped",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function handleStripeWebhookEvent(input: {
  db: Database;
  stripe: Stripe;
  cfg: StripeBillingConfig;
  rawBody: string | Buffer;
  signature: string;
}): Promise<{ handled: string }> {
  const event = input.stripe.webhooks.constructEvent(
    input.rawBody,
    input.signature,
    input.cfg.webhookSecret,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (workspaceId && subId) {
        const sub = await input.stripe.subscriptions.retrieve(subId);
        await syncSubscriptionFromStripe(input.db, input.cfg, sub, workspaceId);
      }
      return { handled: event.type };
    }
    case "customer.subscription.updated":
    case "customer.subscription.created":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscriptionFromStripe(input.db, input.cfg, sub);
      return { handled: event.type };
    }
    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id: string } | null;
      };
      const subField = invoice.subscription;
      const subId =
        typeof subField === "string" ? subField : (subField?.id ?? null);
      if (subId) {
        const sub = await input.stripe.subscriptions.retrieve(subId);
        await syncSubscriptionFromStripe(input.db, input.cfg, sub);
      }
      return { handled: event.type };
    }
    default:
      return { handled: `ignored:${event.type}` };
  }
}
