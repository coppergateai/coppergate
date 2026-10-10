import styles from "./landing.module.css";

const chips = [
  "GitHub-native",
  "Human approval",
  "Cost visible",
  "CI evidence",
] as const;

export function TrustStrip() {
  return (
    <section className={styles.trust} aria-label="Product guarantees">
      <ul className={styles.trustChips}>
        {chips.map((chip) => (
          <li key={chip} className={styles.trustChip}>
            {chip}
          </li>
        ))}
      </ul>
    </section>
  );
}
