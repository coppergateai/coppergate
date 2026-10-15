import {
  IconArena,
  IconControl,
  IconEvidence,
  IconGithubNative,
} from "./icons";
import styles from "./marketing.module.css";

const items = [
  {
    title: "Compete",
    body: "Multiple agents attempt one engineering task in parallel.",
    Icon: IconArena,
  },
  {
    title: "Verify",
    body: "CI, tests, and policy gates qualify what can win.",
    Icon: IconEvidence,
  },
  {
    title: "Select",
    body: "Efficiency ranks validated work — spend is priced in.",
    Icon: IconGithubNative,
  },
  {
    title: "Control",
    body: "Budgets, policies, and kill-switch stay in your hands.",
    Icon: IconControl,
  },
] as const;

export function CapabilityStrip() {
  return (
    <section className={styles.caps} aria-label="Product pillars">
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
