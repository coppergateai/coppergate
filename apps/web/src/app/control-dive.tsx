import styles from "./landing.module.css";

const budgetRows = [
  { label: "Brief + plan", used: "$0.42", pct: 21 },
  { label: "Coding run #128", used: "$1.84", pct: 37 },
  { label: "Retry (cancelled)", used: "$0.31", pct: 6 },
] as const;

export function ControlDive() {
  return (
    <section
      id="control"
      className={styles.control}
      aria-labelledby="control-title"
    >
      <div className={styles.controlInner}>
        <header className={styles.controlIntro}>
          <h2 id="control-title" className={styles.controlTitle}>
            Cost and merge stay under your hand.
          </h2>
          <p className={styles.controlLede}>
            Budgets hard-stop runaway spend. Approvals keep shipping a human
            decision — pause or cancel anytime.
          </p>
        </header>

        <div className={styles.controlPanels}>
          <div className={styles.divePanel} aria-hidden="true">
            <div className={styles.budgetHead}>
              <span>Project budget</span>
              <span className={styles.budgetTotal}>$2.57 / $20.00</span>
            </div>
            <div className={styles.budgetBar}>
              <span className={styles.budgetFill} style={{ width: "13%" }} />
            </div>
            <ul className={styles.budgetRows}>
              {budgetRows.map((row) => (
                <li key={row.label} className={styles.budgetRow}>
                  <div className={styles.budgetRowTop}>
                    <span>{row.label}</span>
                    <span>{row.used}</span>
                  </div>
                  <div className={styles.budgetMini}>
                    <span style={{ width: `${row.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className={styles.budgetFoot}>Enqueue blocked at 100% reserved</p>
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
              <span className={styles.govMuted}>Cancel run</span>
              <span className={styles.govMuted}>Pause</span>
              <span className={styles.govPrimary}>Approve</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
