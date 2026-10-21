import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/marketing/marketing.module.css";
import { SiteChrome } from "../site-chrome";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What’s new in Coppergate — private beta progress on delivery, gates, and evidence.",
  alternates: { canonical: "/changelog" },
};

const entries = [
  {
    date: "2026-10-16",
    title: "Commercial wedge + hosted billing",
    items: [
      "D14 lock: GitHub issue → verified PR is the paid-pilot KPI",
      "Stripe Checkout / portal for Hosted Starter & Pro (Settings → Billing)",
      "Onboarding and recovery docs oriented to one-session first PR",
      "Wedge depth: Sentry + CI-fail auto-arm; expand-on-pull for the rest",
    ],
  },
  {
    date: "2026-10-15",
    title: "Signal → Arena production adapters",
    items: [
      "Inbound adapters: Sonar, Jira/Linear, Sentry/PagerDuty, CI reverse path, and more",
      "Fitness expansion: coverage, e2e, perf, visual regress, preview smoke",
      "Notify: Slack / Teams / Discord; bounded role spawn (fixer, security, …)",
      "GitHub/GitLab live delivery; Bitbucket/Azure DevOps clients deferred pending closed-loop staging",
    ],
  },
  {
    date: "2026-10-12",
    title: "The Arena Thesis — Selection over Supervision",
    items: [
      "Efficiency contest: payoff e = fitness / spend^α promotes winners",
      "Worker auto-resolves tournaments when ContenderRuns finish",
      "Contender strategies (blitz / fortress / balanced) + payoff board",
      "Public thesis: selection pressure, not an approval inbox",
    ],
  },
  {
    date: "2026-10-12",
    title: "Premium marketing surface",
    items: [
      "Control-plane hero preview with contender fitness demo",
      "Survivor workflow pipeline and capability strip",
      "Google Analytics + contact email updates",
    ],
  },
  {
    date: "2026-10-10",
    title: "Landing, gates, and evidence narrative",
    items: [
      "Public site: how it works, features, cost, governance, FAQ",
      "Security page for approval and GitHub access posture",
      "Early-access waitlist with company + work email",
    ],
  },
  {
    date: "2026-10-10",
    title: "Product core (private beta)",
    items: [
      "Brief generate / approve before execution",
      "Plan + task graph with approval inbox",
      "Agent runs with budget reserve, events, and cancel",
      "GitHub App install path and PR-oriented delivery loop",
    ],
  },
] as const;

export default function ChangelogPage() {
  return (
    <SiteChrome>
      <article className={styles.contentPage}>
        <p className={styles.pageEyebrow}>Product</p>
        <h1 className={styles.pageTitle}>Changelog</h1>
        <p className={styles.pageLede}>
          Release notes — what shipped recently
        </p>

        <div className={styles.changelogList}>
          {entries.map((entry) => (
            <section
              key={`${entry.date}-${entry.title}`}
              className={styles.changelogEntry}
            >
              <p className={styles.changelogDate}>{entry.date}</p>
              <h2 className={styles.changelogTitle}>{entry.title}</h2>
              <ul>
                {entry.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className={styles.changelogMore}>
          <a
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            Star on GitHub
          </a>
          {" · "}
          <a href="mailto:hello@coppergate.ai">Contact</a>
        </p>
      </article>
    </SiteChrome>
  );
}
