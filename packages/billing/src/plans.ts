import type { BillingPlan } from "@coppergate/db";

export type HostedPlanId = Extract<BillingPlan, "starter" | "pro">;

export type PlanDefinition = {
  id: HostedPlanId;
  name: string;
  monthlyUsd: number;
  blurb: string;
  features: string[];
};

/**
 * Paid public pricing is OFF.
 * Do not surface Starter ($99) / Pro ($199) on marketing, docs, or Settings → Billing
 * until product explicitly reopens paid plans. Keep SKUs here for Stripe ops only.
 */
export const PUBLIC_PAID_PRICING_ENABLED = false;

/** Stripe SKU definitions — not for public UI while PUBLIC_PAID_PRICING_ENABLED is false. */
export const HOSTED_PLANS: readonly PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyUsd: 99,
    blurb: "Hosted sandboxes for solo founders on the issue→PR wedge.",
    features: [
      "Managed sandboxes + execution history",
      "Modest concurrency",
      "Issue → verified PR path",
      "Budget caps + kill-switch",
      "Usage billed transparently",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyUsd: 199,
    blurb: "Higher concurrency, previews, and multi-project arenas.",
    features: [
      "Everything in Starter",
      "Higher concurrency + parallel contenders",
      "Preview URLs on supported stacks",
      "Shareable redacted delivery reports",
      "Priority recovery docs + support",
    ],
  },
] as const;

/** Plans exposed to product UI / checkout catalog. Empty while paid pricing is deferred. */
export function publicHostedPlans(): readonly PlanDefinition[] {
  return PUBLIC_PAID_PRICING_ENABLED ? HOSTED_PLANS : [];
}

export function planFromPriceId(
  priceId: string | null | undefined,
  prices: { starter?: string; pro?: string },
): HostedPlanId | null {
  if (!priceId) return null;
  if (prices.starter && priceId === prices.starter) return "starter";
  if (prices.pro && priceId === prices.pro) return "pro";
  return null;
}
