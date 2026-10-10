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
            Budget selects. You hold the kill-switch.
          </h2>
          <p className={styles.controlLede}>
            Spend caps starve weak contenders. Policy and kill-switch stop the
            arena — you are not approving every micro-step.
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
              <span className={styles.govBadge}>Arena</span>
              <span>2 eliminated</span>
            </div>
            <ul className={styles.govList}>
              <li>
                <strong>Contender A</strong>
                <span>fitness 0.91 · CI pass</span>
                <em>Winner</em>
              </li>
              <li>
                <strong>Contender B</strong>
                <span>budget exhausted</span>
                <em>Out</em>
              </li>
              <li className={styles.govActive}>
                <strong>Kill-switch</strong>
                <span>Armed · policy OK</span>
                <em>Ready</em>
              </li>
            </ul>
            <div className={styles.govActions}>
              <span className={styles.govMuted}>Pause arena</span>
              <span className={styles.govMuted}>Raise budget</span>
              <span className={styles.govPrimary}>Kill all</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
