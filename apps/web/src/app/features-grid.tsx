import styles from "./landing.module.css";

const features = [
  {
    title: "GitHub-native PRs",
    body: "Work lands as pull requests in your repos — not paste from a chat window.",
  },
  {
    title: "Human approval gate",
    body: "Merge stays locked until you open the gate. Shipping is always a human decision.",
  },
  {
    title: "Brief → plan",
    body: "Outcomes become structured briefs and task plans you can approve before agents run.",
  },
  {
    title: "Cost per run",
    body: "Project budgets and per-run spend stay visible. When budget is spent, enqueue stops.",
  },
  {
    title: "CI evidence",
    body: "Checks, tests, and diffs ride with the PR so review starts from signal, not vibes.",
  },
  {
    title: "Run & event trace",
    body: "Inbox approvals and run events leave an inspectable path from idea to review.",
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
          <p className={styles.featuresEyebrow}>Features</p>
          <h2 id="features-title" className={styles.featuresTitle}>
            Everything you need to ship behind a gate.
          </h2>
          <p className={styles.featuresLede}>
            Control, evidence, and cost — built for teams that will not merge
            unreviewed AI code.
          </p>
        </header>

        <ul className={styles.featuresGrid}>
          {features.map((feature) => (
            <li key={feature.title} className={styles.featureCard}>
              <span className={styles.featureMark} aria-hidden="true" />
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureBody}>{feature.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
