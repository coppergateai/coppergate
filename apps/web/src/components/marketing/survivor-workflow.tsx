import Link from "next/link";
import { MarketingLottie } from "./marketing-lottie";
import styles from "./marketing.module.css";

const steps = [
  {
    n: "01",
    title: "Define the task",
    body: "Start from an engineering brief or a supported external signal. Bind the repository, set budget and policy boundaries before work begins.",
  },
  {
    n: "02",
    title: "Run the competition",
    body: "Multiple contenders attempt the same objective with controlled execution. Each path spends against the shared budget.",
  },
  {
    n: "03",
    title: "Verify and select",
    body: "Coppergate evaluates results against quality checks, fitness criteria, and spend. Only qualifying contenders compete on efficiency.",
  },
  {
    n: "04",
    title: "Review the delivery",
    body: "Inspect the selected implementation, validation evidence, and pull request before approval. Production writes stay policy-gated.",
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
          <div className={styles.sectionEyebrowRow}>
            <MarketingLottie
              src="/lottie/selection-race.json"
              className={styles.lottieSection}
              label="Selection race"
            />
            <p className={styles.sectionEyebrow}>How it works</p>
          </div>
          <h2 id="how-title" className={styles.sectionTitle}>
            From task to verified PR.
          </h2>
          <p className={styles.sectionLede}>
            Four steps for engineering teams: bind a repo, run a bounded
            competition, verify with evidence, then review the survivor PR.
            You keep the kill-switch and merge control.
          </p>
        </header>

        <ol className={styles.howGrid}>
          {steps.map((step) => (
            <li key={step.n} className={styles.howCard}>
              <span className={styles.howNum}>{step.n}</span>
              <h3 className={styles.howTitle}>{step.title}</h3>
              <p className={styles.howBody}>{step.body}</p>
            </li>
          ))}
        </ol>

        <div className={styles.sectionCtas}>
          <a
            className={styles.btnSecondary}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            Start on GitHub
          </a>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
        </div>
      </div>
    </section>
  );
}
