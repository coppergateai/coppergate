import Link from "next/link";
import styles from "./onboarding-guide.module.css";

export type OnboardingStep = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  done: boolean;
};

type Props = {
  title?: string;
  steps: OnboardingStep[];
  /** Tighter spacing for app shells that already have a section label. */
  compact?: boolean;
};

/** First-run guided path (TASK034). */
export function OnboardingGuide({
  title = "Getting started",
  steps,
  compact = false,
}: Props) {
  const next = steps.find((s) => !s.done) ?? null;

  return (
    <section className={`${styles.guide} ${compact ? styles.compact : ""}`}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.next}>
        {next ? (
          <>
            Next: <span className={styles.nextStrong}>{next.title}</span>
          </>
        ) : (
          "You’re set — approve a task when ready."
        )}
      </p>
      <ol className={styles.list}>
        {steps.map((step, i) => {
          const isNext = next?.id === step.id;
          return (
            <li
              key={step.id}
              className={`${styles.step} ${isNext ? styles.stepNext : ""}`}
            >
              <span
                className={`${styles.index} ${
                  step.done ? styles.indexDone : isNext ? styles.indexNext : ""
                }`}
              >
                {step.done ? "✓" : i + 1}
              </span>
              <div className={styles.body}>
                {step.href && !step.done ? (
                  <Link href={step.href} className={styles.link}>
                    {step.title}
                  </Link>
                ) : (
                  <span
                    className={`${styles.stepTitle} ${
                      step.done
                        ? styles.stepTitleDone
                        : isNext
                          ? styles.stepTitleNext
                          : ""
                    }`}
                  >
                    {step.title}
                  </span>
                )}
                <div className={styles.detail}>{step.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
