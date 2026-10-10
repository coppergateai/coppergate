import styles from "./landing.module.css";

const features = [
  {
    title: "Tournament runs",
    body: "N contenders on the same goal. The arena keeps the fittest path — not the loudest chat.",
  },
  {
    title: "Budget as selection",
    body: "Spend caps starve weak agents. When the budget is gone, they are out of the pool.",
  },
  {
    title: "Fitness evidence",
    body: "Critic scores, diffs, and CI ride with the winner — promotion starts from signal.",
  },
  {
    title: "Kill-switch, not inbox",
    body: "You configure policy and can halt the arena. You are not approving every micro-step.",
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
            Built for autonomy with teeth.
          </h2>
          <p className={styles.featuresLede}>
            For operators who want agents to fight — and only survivors to ship.
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
