import Link from "next/link";
import styles from "./marketing.module.css";

const items = [
  {
    title: "Repository boundaries",
    body: "GitHub App installs are scoped to the orgs and repos you choose. Identity OAuth stays separate from repo access.",
    availability: "Available",
  },
  {
    title: "Budget enforcement",
    body: "Project spend caps and reservations stop runaway work. Exhausted paths exit the pool instead of burning unlimited credits.",
    availability: "Available",
  },
  {
    title: "Execution policies",
    body: "Forbidden paths, secrets, and production-write gates constrain what agents can touch while the Arena runs.",
    availability: "Available",
  },
  {
    title: "Evidence-based evaluation",
    body: "CI, Sonar, coverage, e2e, and critic signals travel with runs so promotion decisions stay inspectable.",
    availability: "Available",
  },
  {
    title: "Kill-switch",
    body: "Cooperative cancel and Arena-level stop are first-class. You can halt work without waiting for an agent to finish.",
    availability: "Available",
  },
  {
    title: "Signal ingress controls",
    body: "Webhook secrets, fingerprint dedupe, and per-workspace storm quotas keep inbound floods from burning budget.",
    availability: "In release",
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
          Coppergate is built for controlled competition — not unbounded agent
          access. Status labels below reflect what ships in the current release.{" "}
          <Link href="/security" className={styles.inlineDocLink}>
            Security overview
          </Link>
          .
        </p>

        <div className={styles.securityGrid}>
          {items.map((item) => (
            <article key={item.title} className={styles.securityItem}>
              <div className={styles.securityItemTop}>
                <h3>{item.title}</h3>
                <span className={styles.statusQuiet}>{item.availability}</span>
              </div>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
