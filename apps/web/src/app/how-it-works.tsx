import styles from "./landing.module.css";

const steps = [
  {
    n: "01",
    title: "Set the arena",
    body: "Drop a goal, policy, and spend cap. Coppergate spins up contenders — you are not the referee.",
    cue: "Goal · policy · budget",
    visual: "idea" as const,
  },
  {
    n: "02",
    title: "Contenders race",
    body: "Multiple agents attack the same work in parallel. Weak paths burn budget; strong paths keep going.",
    cue: "N agents · shared task",
    visual: "plan" as const,
  },
  {
    n: "03",
    title: "Fitness gate",
    body: "Critics score. CI and tests decide. The winner promotes with evidence — losers starve.",
    cue: "Critic · CI · elimination",
    visual: "pr" as const,
  },
  {
    n: "04",
    title: "Survive to ship",
    body: "Survivors ship through the fitness gate. You hold the kill-switch and production policy — not every merge click.",
    cue: "Kill-switch · policy",
    visual: "gate" as const,
  },
] as const;

function StepVisual({ kind }: { kind: (typeof steps)[number]["visual"] }) {
  if (kind === "idea") {
    return (
      <div className={styles.howVisual}>
        <span className={styles.howVisualLabel}>Arena</span>
        <p className={styles.howVisualLine}>“Ship a subscription tracker MVP”</p>
        <span className={styles.howVisualMeta}>Budget $50 · kill-switch armed</span>
      </div>
    );
  }
  if (kind === "plan") {
    return (
      <div className={styles.howVisual}>
        <span className={styles.howVisualLabel}>Tournament</span>
        <ul className={styles.howVisualList}>
          <li>Contender A · running</li>
          <li>Contender B · running</li>
          <li>Contender C · budget low</li>
        </ul>
      </div>
    );
  }
  if (kind === "pr") {
    return (
      <div className={styles.howVisual}>
        <span className={styles.howVisualLabel}>Fitness</span>
        <p className={styles.howVisualLine}>
          <span className={styles.howVisualPass}>CI</span>
          <span className={styles.howVisualCost}>critic 0.91</span>
        </p>
        <span className={styles.howVisualMeta}>Winner → promote · 2 eliminated</span>
      </div>
    );
  }
  return (
    <div className={`${styles.howVisual} ${styles.howVisualGate}`}>
      <span className={styles.howVisualLabel}>Gate</span>
      <p className={styles.howVisualLine}>Fitness passed</p>
      <span className={styles.howVisualMeta}>Kill-switch ready</span>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className={styles.how}
      aria-labelledby="how-title"
    >
      <div className={styles.howInner}>
        <header className={styles.howIntro}>
          <p className={styles.howEyebrow}>How it works</p>
          <h2 id="how-title" className={styles.howTitle}>
            A Survivor loop, not an approval inbox.
          </h2>
          <p className={styles.howLede}>
            Contenders compete. Critics score. Fitness decides who ships — and
            who gets eliminated.
          </p>
        </header>

        <ol className={styles.howSteps}>
          {steps.map((step) => (
            <li key={step.n} className={styles.howStep}>
              <span className={styles.howNum}>{step.n}</span>
              <StepVisual kind={step.visual} />
              <div className={styles.howCopy}>
                <h3 className={styles.howStepTitle}>{step.title}</h3>
                <p className={styles.howStepBody}>{step.body}</p>
              </div>
              <p className={styles.howCue}>{step.cue}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
