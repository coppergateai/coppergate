import styles from "./marketing.module.css";

const steps = [
  {
    n: "01",
    stage: "Arena",
    title: "Set the arena",
    body: "Define the goal, repository, budget, policies, and execution boundaries before contenders start.",
    visual: (
      <div className={`${styles.stepVisual} ${styles.stepVisualArena}`}>
        <span className={styles.miniLabel}>Goal configuration</span>
        <div className={styles.arenaField}>
          Build a subscription tracker MVP
        </div>
        <div className={styles.chipRow}>
          <span className={styles.chip}>Repo bound</span>
          <span className={styles.chip}>Budget $50</span>
          <span className={`${styles.chip} ${styles.chipAccent}`}>
            Kill-switch
          </span>
        </div>
      </div>
    ),
  },
  {
    n: "02",
    stage: "Tournament",
    title: "Contenders race",
    body: "Multiple agents attack the same objective in parallel. Weak paths burn budget; strong paths continue.",
    visual: (
      <div className={`${styles.stepVisual} ${styles.stepVisualTournament}`}>
        <span className={styles.miniLabel}>Parallel execution</span>
        <ul className={styles.tourProgress}>
          <li>
            <div className={styles.tourProgressTop}>
              <span>Contender A</span>
              <span className={styles.tagRun}>Running</span>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: "78%" }} />
            </div>
          </li>
          <li>
            <div className={styles.tourProgressTop}>
              <span>Contender B</span>
              <span className={styles.tagRun}>Running</span>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: "62%" }} />
            </div>
          </li>
          <li>
            <div className={styles.tourProgressTop}>
              <span>Contender C</span>
              <span className={styles.tagOut}>Low fitness</span>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFillMuted} style={{ width: "28%" }} />
            </div>
          </li>
        </ul>
      </div>
    ),
  },
  {
    n: "03",
    stage: "Fitness",
    title: "Fitness decides",
    body: "Critics score. CI and tests validate. Policy compliance is checked before anything promotes.",
    visual: (
      <div className={`${styles.stepVisual} ${styles.stepVisualFitness}`}>
        <span className={styles.miniLabel}>Evaluation pack</span>
        <div className={styles.fitnessMiniScore}>
          <span>Critic</span>
          <strong>0.91</strong>
        </div>
        <ul className={styles.checkList}>
          <li>
            <span className={styles.checkOk} />
            CI passing
          </li>
          <li>
            <span className={styles.checkOk} />
            Tests green
          </li>
          <li>
            <span className={styles.checkOk} />
            Policy compliant
          </li>
        </ul>
      </div>
    ),
  },
  {
    n: "04",
    stage: "Survivor",
    title: "Survive to ship",
    body: "The validated winner promotes with evidence. Eliminated contenders stop. You retain deployment control.",
    visual: (
      <div className={`${styles.stepVisual} ${styles.stepVisualSurvivor}`}>
        <span className={styles.miniLabel}>Promotion</span>
        <div className={styles.winnerCard}>
          <span>Contender A</span>
          <span className={styles.tagWin}>Winner</span>
        </div>
        <ul className={styles.miniList}>
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
          {steps.map((step, index) => (
            <li key={step.n} className={styles.step}>
              {index > 0 ? (
                <span className={styles.stepConnector} aria-hidden="true" />
              ) : null}
              <div className={styles.stepCopy}>
                <span className={styles.stepNum}>
                  {step.n} · {step.stage}
                </span>
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
