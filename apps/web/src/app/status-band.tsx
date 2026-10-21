import styles from "./landing.module.css";

export function StatusBand() {
  return (
    <section className={styles.statusBand} aria-label="Open source status">
      <div className={styles.statusInner}>
        <span className={styles.statusDot} aria-hidden="true" />
        <p className={styles.statusText}>
          <strong>Open source (MIT)</strong> — free to self-host. GitHub fitness
          wedge live; Survivor tournament evolving.
        </p>
        <a
          className={styles.statusLink}
          href="https://github.com/coppergateai/coppergate"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </section>
  );
}
