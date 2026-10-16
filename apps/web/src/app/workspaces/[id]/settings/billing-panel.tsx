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
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    hasCustomer: boolean;
  } | null;
  plans: Plan[];
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
  checkoutFlag?: string;
};

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

  return (
    <div className={styles.stackWide}>
      <section className={styles.section} aria-labelledby="billing-heading">
        <h2 id="billing-heading" className={styles.sectionLabel}>
          Hosted billing
        </h2>
        <p className={styles.sectionLede}>
          Starter / Pro for managed sandboxes. Community (MIT self-host) stays
          free — pay for hosted ops, not the arena idea. Usage (model/compute)
          is billed transparently on top of the plan.
        </p>
        {checkoutFlag === "success" ? (
          <p className={styles.note}>Checkout complete — subscription syncing.</p>
        ) : null}
        {checkoutFlag === "cancel" ? (
          <p className={styles.note}>Checkout cancelled.</p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {!state ? (
          <p className={styles.note}>Loading…</p>
        ) : (
          <>
            <dl className={styles.readOnly}>
              <div>
                <dt>Effective plan</dt>
                <dd>{state.plan}</dd>
              </div>
              <div>
                <dt>Stripe</dt>
                <dd>{state.configured ? "configured" : "not configured"}</dd>
              </div>
              {state.subscription ? (
                <>
                  <div>
                    <dt>Status</dt>
                    <dd>{state.subscription.status}</dd>
                  </div>
                  {state.subscription.currentPeriodEnd ? (
                    <div>
                      <dt>Period end</dt>
                      <dd>
                        {new Date(
                          state.subscription.currentPeriodEnd,
                        ).toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                </>
              ) : null}
            </dl>

            {!state.configured ? (
              <p className={styles.note}>
                Operators: set{" "}
                <code>STRIPE_SECRET_KEY</code>,{" "}
                <code>STRIPE_WEBHOOK_SECRET</code>,{" "}
                <code>STRIPE_PRICE_STARTER</code>,{" "}
                <code>STRIPE_PRICE_PRO</code>. Until then, use paid pilot
                invites.
              </p>
            ) : null}

            {isOwner && state.configured ? (
              <div className={styles.stackWide}>
                {state.plans.map((plan) => (
                  <section
                    key={plan.id}
                    className={styles.section}
                    aria-label={plan.name}
                  >
                    <h3 className={styles.sectionLabel}>
                      {plan.name} · ${plan.monthlyUsd}/mo
                    </h3>
                    <p className={styles.sectionLede}>{plan.blurb}</p>
                    <ul className={styles.muted}>
                      {plan.features.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                    <p>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={pending}
                        onClick={() => void startCheckout(plan.id)}
                      >
                        Upgrade to {plan.name}
                      </button>
                    </p>
                  </section>
                ))}
                {state.subscription?.hasCustomer ? (
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
            ) : !isOwner ? (
              <p className={styles.note}>Only owners can change billing.</p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
