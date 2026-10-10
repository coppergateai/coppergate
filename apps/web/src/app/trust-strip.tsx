import styles from "./landing.module.css";

const items = [
  { label: "GitHub-native", detail: "PRs in your repos" },
  { label: "Human approval", detail: "You open the gate" },
  { label: "Cost visible", detail: "Spend per run" },
  { label: "CI evidence", detail: "Checks before merge" },
] as const;

export function TrustStrip() {
  return (
    <section className={styles.trust} aria-label="Product guarantees">
      <ul className={styles.trustList}>
        {items.map((item) => (
          <li key={item.label} className={styles.trustItem}>
            <span className={styles.trustMark} aria-hidden="true" />
            <span className={styles.trustLabel}>{item.label}</span>
            <span className={styles.trustDetail}>{item.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
