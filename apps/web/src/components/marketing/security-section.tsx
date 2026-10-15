import Link from "next/link";
import styles from "./marketing.module.css";

const items = [
  {
    title: "Repository boundaries",
    body: "GitHub App installs are scoped to the orgs and repos you choose. Identity OAuth stays separate from repo access.",
  },
  {
    title: "Budget enforcement",
    body: "Project spend caps and reservations stop runaway work. Exhausted paths exit the pool instead of burning unlimited credits.",
  },
  {
    title: "Execution policies",
    body: "Forbidden paths, secrets, and production-write gates constrain what agents can touch while the arena runs.",
  },
  {
    title: "Evidence-based evaluation",
    body: "CI, Sonar, coverage, e2e, and critic signals travel with runs so promotion decisions are inspectable after the fact.",
  },
  {
    title: "Kill-switch behavior",
    body: "Cooperative cancel and arena-level stop are first-class. You can halt work without waiting for an agent to finish politely.",
  },
  {
    title: "Signal ingress controls",
    body: "Webhook secrets, fingerprint dedupe, and per-workspace / provider storm quotas keep inbound floods from burning budget.",
  },
] as const;

export function SecuritySection() {
  return (
    <section
      id="security-overview"
      className={styles.section}
      aria-labelledby="security-title"
    >
      <div className={styles.sectionInner}>
        <p className={styles.sectionEyebrow}>Trust</p>
        <h2 id="security-title" className={styles.sectionTitle}>
          Autonomy with boundaries.
        </h2>
        <p className={styles.sectionLede}>
          Coppergate is built for controlled autonomy — not unbounded agent
          access.{" "}
          <Link href="/security" style={{ color: "var(--copper-hot)" }}>
            Read the security overview
          </Link>
          .
        </p>

        <div className={styles.securityGrid}>
          {items.map((item) => (
            <article key={item.title} className={styles.securityItem}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
