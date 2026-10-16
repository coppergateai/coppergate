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
    default:
      return { handled: `ignored:${event.type}` };
  }
}
