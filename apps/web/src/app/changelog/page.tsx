import type { Metadata } from "next";
import Link from "next/link";
import { SiteChrome } from "../site-chrome";
import styles from "../landing.module.css";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What’s new in Coppergate — private beta progress on delivery, gates, and evidence.",
  alternates: { canonical: "/changelog" },
};

const entries = [
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
      <article className={styles.legal}>
        <h1 className={styles.legalTitle}>Changelog</h1>
        <p className={styles.legalUpdated}>
          Private beta notes — what shipped recently
        </p>

        <div className={styles.changelogList}>
          {entries.map((entry) => (
            <section key={`${entry.date}-${entry.title}`} className={styles.changelogEntry}>
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
          Want a seat?{" "}
          <Link href="/#early-access">Request access</Link>
          {" · "}
          <a href="mailto:hello@coppergate.ai">Contact</a>
        </p>
      </article>
    </SiteChrome>
  );
}
