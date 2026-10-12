import {
  IconArena,
  IconControl,
  IconEvidence,
  IconGithubNative,
} from "./icons";
import styles from "./marketing.module.css";

const items = [
  {
    title: "AI Agent Arena",
    body: "Multiple agents. One goal. Measurable competition.",
    Icon: IconArena,
  },
  {
    title: "GitHub Native",
    body: "Your repositories, workflows, and delivery process.",
    Icon: IconGithubNative,
  },
  {
    title: "Evidence Driven",
    body: "Tests, CI, critic evaluations, and fitness scores.",
    Icon: IconEvidence,
  },
  {
    title: "Human in Control",
    body: "Spending limits, policies, and kill-switch.",
    Icon: IconControl,
  },
] as const;

export function CapabilityStrip() {
  return (
    <section className={styles.caps} aria-label="Capabilities">
      <div className={styles.capsInner}>
        {items.map(({ title, body, Icon }) => (
          <div key={title} className={styles.capItem}>
            <span className={styles.capIcon}>
              <Icon />
            </span>
            <h2 className={styles.capTitle}>{title}</h2>
            <p className={styles.capBody}>{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
