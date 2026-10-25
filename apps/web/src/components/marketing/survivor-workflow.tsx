import Link from "next/link";
import { MarketingLottie } from "./marketing-lottie";
import styles from "./marketing.module.css";

const steps = [
  {
    n: "01",
    title: "Bind the Open Program",
    body: "Point the workspace at a living program file. Agents may spend only against Open IDs — freestyle autonomy is refused when the program is bound.",
  },
  {
    n: "02",
    title: "License the spend",
    body: "Each Arena reserve and fan-out carries an Open ID. Contenders race inside the budget; no Open ID means no spend.",
  },
  {
    n: "03",
    title: "Verify with evidence",
    body: "Fitness, CI, and spend travel with the survivor path. Efficiency ranking selects among qualifying contenders.",
  },
  {
    n: "04",
    title: "Accept → Ship Receipt",
    body: "You Accept once. Coppergate writes the program line Done and issues a Ship Receipt — spend, fitness, CI, writeback — not a chat log.",
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
            From program line to Ship Receipt.
          </h2>
          <p className={styles.sectionLede}>
            Contracted Autonomy: Open Program → Spend License → Survivor
            evidence → Accept + Receipt. You keep the kill-switch and merge
            control. Community stays $0.
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
