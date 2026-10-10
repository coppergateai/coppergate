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
          <p className={styles.diveEyebrow}>Governance</p>
          <h2 id="gov-title" className={styles.diveTitle}>
            You open the gate. Autonomy is never the default.
          </h2>
          <p className={styles.diveLede}>
            Agents can plan and open pull requests. They cannot ship. Brief
            approval, task approval, and merge stay under your hand — pause or
            cancel a run whenever you need to.
          </p>
          <ul className={styles.divePoints}>
            <li>Approve briefs and tasks before execution starts</li>
            <li>Cancel in-flight runs cooperatively</li>
            <li>Merge locked until you explicitly approve</li>
          </ul>
        </div>

        <div className={styles.divePanel} aria-hidden="true">
          <div className={styles.govHead}>
            <span className={styles.govBadge}>Inbox</span>
            <span>3 awaiting you</span>
          </div>
          <ul className={styles.govList}>
            <li>
              <strong>Brief</strong>
              <span>Subscription tracker MVP</span>
              <em>Approve</em>
            </li>
            <li>
              <strong>Task</strong>
              <span>feat: billing hooks</span>
              <em>Approve</em>
            </li>
            <li className={styles.govActive}>
              <strong>Merge</strong>
              <span>PR #128 · CI passing</span>
              <em>Open gate</em>
            </li>
          </ul>
          <div className={styles.govActions}>
            <span>Cancel run</span>
            <span>Pause</span>
            <span className={styles.govPrimary}>Approve</span>
          </div>
        </div>
      </div>
    </section>
  );
}
