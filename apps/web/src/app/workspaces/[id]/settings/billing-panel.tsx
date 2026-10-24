"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

type Plan = {
  id: string;
  name: string;
  monthlyUsd: number;
  blurb: string;
  features: string[];
};

type BillingState = {
  configured: boolean;
  plan: string;
  limits?: {
    maxConcurrentRuns: number;
    maxTournamentFanout: number;
    previewEnabled: boolean;
    arenaEnabled: boolean;
  };
  usage?: {
    periodLabel: string;
    spentMicros: number;
    eventCount: number;
    byKind: Array<{ kind: string; spentMicros: number; count: number }>;
  };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasCustomer: boolean;
    paymentFailed?: boolean;
  } | null;
  plans: Plan[];
  paidPricingEnabled?: boolean;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
  checkoutFlag?: string;
};

function formatPlanLabel(plan: string) {
  if (plan === "community") return "Community";
  if (plan === "starter") return "Starter";
  if (plan === "pro") return "Pro";
  return plan;
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

export function BillingPanel({ workspaceId, isOwner, checkoutFlag }: Props) {
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/billing`);
    const data = (await res.json()) as BillingState & {
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load billing");
      return;
    }
    setState(data);
    setError(null);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // After Checkout redirect, poll until webhook syncs the subscription.
  useEffect(() => {
    if (checkoutFlag !== "success") return;
    if (state?.plan && state.plan !== "community") return;
    const id = window.setInterval(() => {
      void load();
    }, 2500);
    return () => window.clearInterval(id);
  }, [checkoutFlag, load, state?.plan]);

  async function startCheckout(plan: string) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/billing`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "checkout", plan }),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: { message?: string };
      };
      if (!res.ok || !data.url) {
        setError(data.error?.message ?? "Checkout failed");
        return;
      }
      window.location.href = data.url;
    } finally {
      setPending(false);
    }
  }

  async function openPortal() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/billing`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "portal" }),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: { message?: string };
      };
      if (!res.ok || !data.url) {
        setError(data.error?.message ?? "Portal failed");
        return;
      }
      window.location.href = data.url;
    } finally {
      setPending(false);
    }
  }

  const effective = state?.plan ?? "community";
  const isPaid = effective === "starter" || effective === "pro";
  const syncing =
    checkoutFlag === "success" && (!state || state.plan === "community");

  return (
    <div className={styles.stackWide}>
      <section className={styles.section} aria-labelledby="billing-heading">
        <div className={styles.billingIntro}>
          <div>
            <h2 id="billing-heading" className={styles.sectionLabel}>
              Hosted billing
            </h2>
            <p className={styles.sectionLede}>
              Pay for managed sandboxes and hosted ops — Community self-host stays
              free. Model and compute usage bill on top of the plan.
            </p>
          </div>
          {isOwner && state?.configured && state.subscription?.hasCustomer ? (
            <button
              type="button"
              className={styles.ghostBtn}
              disabled={pending}
              onClick={() => void openPortal()}
            >
              Manage billing
            </button>
          ) : null}
        </div>

        {checkoutFlag === "success" ? (
          <p
            className={syncing ? styles.billingBannerSync : styles.billingBannerOk}
            role="status"
          >
            {syncing
              ? "Checkout complete — waiting for Stripe to sync your plan…"
              : `You're on ${formatPlanLabel(effective)}. Welcome aboard.`}
          </p>
        ) : null}
        {checkoutFlag === "cancel" ? (
          <p className={styles.billingBannerMute} role="status">
            Checkout cancelled — no charge was made.
          </p>
        ) : null}
        {state?.subscription?.paymentFailed ? (
          <p className={styles.error} role="alert">
            Payment failed — update your card in Manage billing to restore
            hosted concurrency and previews.
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {!state ? (
          <div className={styles.note} aria-busy="true">
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLine} style={{ width: "55%" }} />
          </div>
        ) : (
          <>
            {state.usage ? (
              <div className={styles.section} style={{ marginBottom: "1.25rem" }}>
                <p className={styles.statLabel}>
                  Usage this month ({state.usage.periodLabel})
                </p>
                <p className={styles.statValue}>
                  ${(state.usage.spentMicros / 1_000_000).toFixed(4)}
                </p>
                <p className={styles.statHint}>
                  {state.usage.eventCount} ledger events · same source as project
                  budgets · synced to Stripe customer metadata when paid
                </p>
                {state.limits ? (
                  <p className={styles.note}>
                    Limits: {state.limits.maxConcurrentRuns} concurrent run
                    {state.limits.maxConcurrentRuns === 1 ? "" : "s"}, fan-out{" "}
                    {state.limits.maxTournamentFanout}
                    {state.limits.previewEnabled ? ", previews on" : ", no preview"}
                    {!isPaid &&
                    state.paidPricingEnabled &&
                    state.plans.length > 0 ? (
                      <>
                        {" "}
                        ·{" "}
                        <button
                          type="button"
                          className={styles.ghostBtn}
                          disabled={pending || !state.configured}
                          onClick={() => void startCheckout("starter")}
                        >
                          Upgrade for higher limits
                        </button>
                      </>
                    ) : null}
                  </p>
                ) : null}
                <p className={styles.note}>
                  <a
                    href={`/api/workspaces/${workspaceId}/cost?days=31&format=csv`}
                    download={`coppergate-usage-${state.usage.periodLabel}.csv`}
                  >
                    Export CSV (31d)
                  </a>
                </p>
              </div>
            ) : null}

            <div className={styles.statGrid}>
              <div className={styles.statCard}>
                <p className={styles.statLabel}>Current plan</p>
                <p className={styles.statValue}>
                  {formatPlanLabel(effective)}
                </p>
                <p className={styles.statHint}>
                  {isPaid
                    ? "Hosted subscription active"
                    : "MIT self-host · no hosted fee"}
                </p>
              </div>
              <div className={styles.statCard}>
                <p className={styles.statLabel}>Stripe</p>
                <p className={styles.statValue}>
                  {state.configured ? "Ready" : "Off"}
                </p>
                <p className={styles.statHint}>
                  {state.configured
                    ? "Checkout & portal available"
                    : "Env keys not configured"}
                </p>
              </div>
              {state.subscription ? (
                <>
                  <div className={styles.statCard}>
                    <p className={styles.statLabel}>Status</p>
                    <p className={styles.statValue}>
                      {formatStatus(state.subscription.status)}
                    </p>
                    <p className={styles.statHint}>
                      {state.subscription.cancelAtPeriodEnd
                        ? "Cancels at period end"
                        : "Renews automatically"}
                    </p>
                  </div>
                  {state.subscription.currentPeriodEnd ? (
                    <div className={styles.statCard}>
                      <p className={styles.statLabel}>Period ends</p>
                      <p className={styles.statValueSm}>
                        {new Date(
                          state.subscription.currentPeriodEnd,
                        ).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <p className={styles.statHint}>Next invoice boundary</p>
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            {state.paidPricingEnabled === false || state.plans.length === 0 ? (
              <p className={styles.note}>
                Paid hosted plans (Starter / Pro) are not offered right now.
                Community / self-host stays free. Usage above is for spend
                visibility only.
              </p>
            ) : null}

            {!state.configured && state.paidPricingEnabled ? (
              <p className={styles.note}>
                Operators: set{" "}
                <code>STRIPE_SECRET_KEY</code>,{" "}
                <code>STRIPE_WEBHOOK_SECRET</code>,{" "}
                <code>STRIPE_PRICE_STARTER</code>,{" "}
                <code>STRIPE_PRICE_PRO</code>. Until then, use paid pilot
                invites.
              </p>
            ) : null}

            {isOwner &&
            state.configured &&
            state.paidPricingEnabled &&
            state.plans.length > 0 ? (
              <div className={styles.billingPlanGrid}>
                {state.plans.map((plan) => {
                  const current = effective === plan.id;
                  return (
                    <article
                      key={plan.id}
                      className={
                        current
                          ? `${styles.billingPlanCard} ${styles.billingPlanCardCurrent}`
                          : styles.billingPlanCard
                      }
                      aria-label={plan.name}
                    >
                      <header className={styles.billingPlanHead}>
                        <div>
                          <p className={styles.billingPlanName}>{plan.name}</p>
                          {current ? (
                            <span className={styles.billingPlanBadge}>
                              Current
                            </span>
                          ) : null}
                        </div>
                        <p className={styles.billingPlanPrice}>
                          <span className={styles.billingPlanAmount}>
                            ${plan.monthlyUsd}
                          </span>
                          <span className={styles.billingPlanPer}>/mo</span>
                        </p>
                      </header>
                      <p className={styles.billingPlanBlurb}>{plan.blurb}</p>
                      <ul className={styles.billingFeatureList}>
                        {plan.features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                      <div className={styles.billingPlanActions}>
                        {current ? (
                          <button
                            type="button"
                            className={styles.ghostBtn}
                            disabled
                          >
                            Current plan
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.primaryBtn}
                            disabled={pending}
                            onClick={() => void startCheckout(plan.id)}
                          >
                            {isPaid ? `Switch to ${plan.name}` : `Upgrade to ${plan.name}`}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : !isOwner && state.paidPricingEnabled ? (
              <p className={styles.note}>Only owners can change billing.</p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
