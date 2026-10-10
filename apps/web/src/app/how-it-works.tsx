import styles from "./landing.module.css";

const steps = [
  {
    n: "01",
    title: "Idea",
    body: "Drop a brief outcome. Coppergate turns it into a structured product brief you can approve.",
    cue: "Raw idea → scoped brief",
    visual: "idea" as const,
  },
  {
    n: "02",
    title: "Plan",
    body: "A task graph with clear acceptance criteria — not an unbounded chat thread.",
    cue: "Tasks · criteria · budget",
    visual: "plan" as const,
  },
  {
    n: "03",
    title: "PR + CI",
    body: "Agents open a pull request with diffs, tests, and cost attached as evidence.",
    cue: "Diff · checks · $ spend",
    visual: "pr" as const,
  },
  {
    n: "04",
    title: "You open the gate",
    body: "Merge stays locked until you approve. Shipping remains a human decision.",
    cue: "Approval required",
    visual: "gate" as const,
  },
] as const;

function StepVisual({ kind }: { kind: (typeof steps)[number]["visual"] }) {
  if (kind === "idea") {
    return (
      <div className={styles.howVisual}>
        <span className={styles.howVisualLabel}>Brief</span>
        <p className={styles.howVisualLine}>“Ship a subscription tracker MVP”</p>
        <span className={styles.howVisualMeta}>Awaiting structure…</span>
      </div>
    );
  }
  if (kind === "plan") {
    return (
      <div className={styles.howVisual}>
        <span className={styles.howVisualLabel}>Plan</span>
        <ul className={styles.howVisualList}>
          <li>Auth + billing hooks</li>
          <li>Tracker list UI</li>
          <li>Acceptance tests</li>
        </ul>
      </div>
    );
  }
  if (kind === "pr") {
    return (
      <div className={styles.howVisual}>
        <span className={styles.howVisualLabel}>Pull request</span>
        <p className={styles.howVisualLine}>
          <span className={styles.howVisualPass}>CI</span>
          <span className={styles.howVisualCost}>$1.84</span>
        </p>
        <span className={styles.howVisualMeta}>+182 −14 · 12 files</span>
      </div>
    );
  }
  return (
    <div className={`${styles.howVisual} ${styles.howVisualGate}`}>
      <span className={styles.howVisualLabel}>Gate</span>
      <p className={styles.howVisualLine}>Merge locked</p>
      <span className={styles.howVisualMeta}>Your approval required</span>
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
            A controlled path from brief to PR.
          </h2>
          <p className={styles.howLede}>
            Four gates. Each one leaves evidence you can inspect before anything
            ships.
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
