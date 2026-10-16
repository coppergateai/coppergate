import Link from "next/link";
import { HOSTED_PLANS } from "@coppergate/billing";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../../site-chrome";

export const metadata = {
  title: "Pricing · Coppergate Docs",
  description:
    "Hosted Starter and Pro plans, arena budgets, cost per survivor PR, and paid pilots.",
};

export default function PricingPage() {
  return (
    <SiteChrome>
      <main className={styles.contentPage}>
        <Link className={styles.backLink} href="/docs">
          ← Docs
        </Link>
        <p className={styles.pageEyebrow}>Docs</p>
        <h1 className={styles.pageTitle}>Pricing</h1>
        <div className={styles.prose}>
          <p>
            MIT community / self-host is free. Hosted plans pay for managed
            sandboxes and ops — not unlimited agent loops. Budget is selection
            pressure: weak paths starve; survivors ship with a cost ledger.
          </p>

          <h2>Community</h2>
          <ul>
            <li>$0 — self-host (Compose), BYOK, user-managed sandboxes</li>
            <li>Full product source under MIT</li>
          </ul>

          <h2>Hosted</h2>
          {HOSTED_PLANS.map((plan) => (
            <div key={plan.id}>
              <h3>
                {plan.name} — ${plan.monthlyUsd}/mo + usage
              </h3>
              <p>{plan.blurb}</p>
              <ul>
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}

          <h2>Pilot path</h2>
          <ul>
            <li>Invite-gated private beta; paid pilots redeem a <code>paid_pilot</code> invite</li>
            <li>Wedge KPI: GitHub issue → verified PR (see docs)</li>
            <li>Cost per accepted (survivor) PR is a first-class metric</li>
          </ul>

          <p>
            Owners upgrade in{" "}
            <strong>Workspace settings → Billing</strong> when Stripe is
            configured. Questions?{" "}
            <a href="mailto:hello@coppergate.ai">hello@coppergate.ai</a> or{" "}
            <Link href="/#early-access">join the waitlist</Link>.
          </p>
        </div>
      </main>
    </SiteChrome>
  );
}
