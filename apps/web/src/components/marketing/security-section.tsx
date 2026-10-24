import Link from "next/link";
import styles from "./marketing.module.css";

const items = [
  {
    title: "Repository boundaries",
    body: "GitHub App and GitLab project installs are scoped to the orgs and repos you choose. Identity OAuth stays separate from repo access.",
  },
  {
    title: "Budget enforcement",
    body: "Project spend caps and reservations stop runaway work. Exhausted paths exit the pool instead of burning unlimited credits.",
  },
  {
    title: "Execution policies",
    body: "Forbidden paths, secrets, and production-write gates constrain what agents can touch while the Arena runs.",
  },
  {
    title: "Evidence-based evaluation",
    body: "CI, Sonar, coverage, e2e, and critic signals travel with runs so promotion decisions stay inspectable.",
  },
  {
    title: "Kill-switch",
    body: "Cooperative cancel and Arena-level stop are first-class. You can halt work without waiting for an agent to finish.",
  },
  {
    title: "Signal ingress controls",
    body: "Webhook secrets, fingerprint dedupe, and per-workspace storm quotas keep inbound floods from burning budget. Shipping in the current release.",
  },
] as const;

export function SecuritySection() {
  return (
    <section
      id="controls"
      className={styles.section}
      aria-labelledby="controls-title"
    >
      <div className={styles.sectionInner}>
        <p className={styles.sectionEyebrow}>Controls & safety</p>
        <h2 id="controls-title" className={styles.sectionTitle}>
          Autonomy with hard boundaries.
        </h2>
        <p className={styles.sectionLede}>
          Controlled competition — not unbounded agent access. Spend caps,
          policies, and a kill-switch stay first-class.{" "}
          <Link href="/security" className={styles.inlineDocLink}>
            Security overview
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

        <div className={styles.sectionCtas}>
          <Link className={styles.btnSecondary} href="/security">
            Read security overview
          </Link>
          <Link className={styles.btnSecondary} href="/docs/limitations">
            See limitations
          </Link>
        </div>
      </div>
    </section>
  );
}
