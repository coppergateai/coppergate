import styles from "./landing.module.css";

const features = [
  {
    title: "Brief → plan",
    body: "Outcomes become structured briefs and task plans you approve before agents run.",
  },
  {
    title: "Budgeted runs",
    body: "Reserve spend before queue. When the budget is gone, enqueue stops.",
  },
  {
    title: "PR with evidence",
    body: "Diffs, CI, and cost ride with the pull request — review starts from signal.",
  },
  {
    title: "Inbox approvals",
    body: "Brief, task, and merge decisions stay in one place you control.",
  },
] as const;

export function FeaturesGrid() {
  return (
    <section
      id="features"
      className={styles.features}
      aria-labelledby="features-title"
    >
      <div className={styles.featuresInner}>
        <header className={styles.featuresIntro}>
          <h2 id="features-title" className={styles.featuresTitle}>
            Everything you need to ship behind a gate.
          </h2>
          <p className={styles.featuresLede}>
            Built for teams that will not merge unreviewed AI code.
          </p>
        </header>

        <ul className={styles.featuresGrid}>
          {features.map((feature) => (
            <li key={feature.title} className={styles.featureCard}>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureBody}>{feature.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
