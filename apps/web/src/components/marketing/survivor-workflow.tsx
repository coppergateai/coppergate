import styles from "./marketing.module.css";

const steps = [
  {
    n: "01",
    title: "Set the arena",
    body: "Define the goal, repository, budget, policies, and execution boundaries before contenders start.",
    visual: (
      <div className={styles.miniUi}>
        <span className={styles.miniLabel}>Goal configuration</span>
        <p className={styles.miniLine}>Build a subscription tracker MVP</p>
        <span className={styles.miniMeta}>
          Repo bound · Budget $50 · Kill-switch armed
        </span>
      </div>
    ),
  },
  {
    n: "02",
    title: "Contenders race",
    body: "Multiple agents attack the same objective in parallel. Weak paths burn budget; strong paths continue.",
    visual: (
      <div className={styles.miniUi}>
        <span className={styles.miniLabel}>Tournament</span>
        <ul className={styles.miniList}>
          <li>
            <span>Contender A</span>
            <span className={styles.tagRun}>Running</span>
          </li>
          <li>
            <span>Contender B</span>
            <span className={styles.tagRun}>Running</span>
          </li>
          <li>
            <span>Contender C</span>
            <span className={styles.tagOut}>Low fitness</span>
          </li>
        </ul>
      </div>
    ),
  },
  {
    n: "03",
    title: "Fitness decides",
    body: "Critics score. CI and tests validate. Policy compliance is checked before anything promotes.",
    visual: (
      <div className={styles.miniUi}>
        <span className={styles.miniLabel}>Fitness evaluation</span>
        <p className={styles.miniLine}>
          Critic 0.91 · <span className={styles.tagRun}>CI pass</span>
        </p>
        <span className={styles.miniMeta}>Tests · Policy · Evidence packed</span>
      </div>
    ),
  },
  {
    n: "04",
    title: "Survive to ship",
    body: "The validated winner promotes with evidence. Eliminated contenders stop. You retain deployment control.",
    visual: (
      <div className={styles.miniUi}>
        <span className={styles.miniLabel}>Promotion</span>
        <ul className={styles.miniList}>
          <li>
            <span>Contender A</span>
            <span className={styles.tagWin}>Winner</span>
          </li>
          <li>
            <span>Contender B</span>
            <span className={styles.tagOut}>Eliminated</span>
          </li>
          <li>
            <span>GitHub PR</span>
            <span className={styles.tagRun}>Ready</span>
          </li>
        </ul>
      </div>
    ),
  },
] as const;

export function SurvivorWorkflow() {
  return (
    <section
      id="how-it-works"
      className={styles.section}
      aria-labelledby="how-title"
    >
      <div className={styles.sectionInner}>
        <header className={styles.workflowHead}>
          <p className={styles.sectionEyebrow}>How it works</p>
          <h2 id="how-title" className={styles.sectionTitle}>
            A Survivor loop, not an approval inbox.
          </h2>
          <p className={styles.sectionLede}>
            Define the goal and boundaries. Coppergate orchestrates contenders,
            evaluates outcomes, and promotes the strongest validated result.
            Full tournament is the north star — private beta ships the GitHub
            fitness path today.
          </p>
        </header>

        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.n} className={styles.step}>
              <div>
                <span className={styles.stepNum}>{step.n}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </div>
              {step.visual}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
