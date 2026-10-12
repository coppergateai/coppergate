import styles from "./landing.module.css";

export function StatusBand() {
  return (
    <section className={styles.statusBand} aria-label="Beta status">
      <div className={styles.statusInner}>
        <span className={styles.statusDot} aria-hidden="true" />
        <p className={styles.statusText}>
          <strong>Private beta</strong> — GitHub fitness wedge live; Survivor
          tournament next. Design-partner seats by invitation.
        </p>
        <a
          className={styles.statusLink}
          href="mailto:muhtalipdede@gmail.com?subject=Design%20partner"
        >
          Talk to us
        </a>
      </div>
    </section>
  );
}
