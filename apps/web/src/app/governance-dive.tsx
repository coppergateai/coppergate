import styles from "./landing.module.css";

export function GovernanceDive() {
  return (
    <section
      id="governance"
      className={`${styles.dive} ${styles.diveAlt}`}
      aria-labelledby="gov-title"
    >
      <div className={`${styles.diveInner} ${styles.diveInnerReverse}`}>
        <div className={styles.diveCopy}>
          <p className={styles.diveEyebrow}>Control</p>
          <h2 id="gov-title" className={styles.diveTitle}>
            The gate is fitness. You hold the kill-switch.
          </h2>
          <p className={styles.diveLede}>
            Agents compete and promote through critic scores and CI. You are not
            the default referee — you configure policy, cap spend, and can halt
            the arena instantly.
          </p>
          <ul className={styles.divePoints}>
            <li>Tournament + elimination instead of org-chart theater</li>
            <li>Kill-switch and cooperative cancel anytime</li>
            <li>Production / default-branch writes stay policy-gated</li>
          </ul>
        </div>

        <div className={styles.divePanel} aria-hidden="true">
          <div className={styles.govHead}>
            <span className={styles.govBadge}>Arena</span>
            <span>live</span>
          </div>
          <ul className={styles.govList}>
            <li>
              <strong>Policy</strong>
              <span>Prod merge off</span>
              <em>Locked</em>
            </li>
            <li>
              <strong>Budget</strong>
              <span>$12.40 / $50.00</span>
              <em>OK</em>
            </li>
            <li className={styles.govActive}>
              <strong>Kill-switch</strong>
              <span>Armed</span>
              <em>Ready</em>
            </li>
          </ul>
          <div className={styles.govActions}>
            <span className={styles.govMuted}>Pause</span>
            <span className={styles.govMuted}>Raise cap</span>
            <span className={styles.govPrimary}>Kill all</span>
          </div>
        </div>
      </div>
    </section>
  );
}
