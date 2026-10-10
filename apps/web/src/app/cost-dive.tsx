import styles from "./landing.module.css";

const rows = [
  { label: "Brief + plan", used: "$0.42", cap: "$2.00", pct: 21 },
  { label: "Coding run #128", used: "$1.84", cap: "$5.00", pct: 37 },
  { label: "Retry (cancelled)", used: "$0.31", cap: "$5.00", pct: 6 },
] as const;

export function CostDive() {
  return (
    <section
      id="cost"
      className={styles.dive}
      aria-labelledby="cost-title"
    >
      <div className={styles.diveInner}>
        <div className={styles.diveCopy}>
          <p className={styles.diveEyebrow}>Cost control</p>
          <h2 id="cost-title" className={styles.diveTitle}>
            Know what every run costs. Stop when the budget is gone.
          </h2>
          <p className={styles.diveLede}>
            Set a project budget. Coppergate reserves spend before a run queues
            and records actuals when it finishes. No black-box token bill at the
            end of the week.
          </p>
          <ul className={styles.divePoints}>
            <li>Hard stop when reserved spend would exceed the budget</li>
            <li>Per-run cost visible next to CI and diffs</li>
            <li>Usage you can inspect before you approve merge</li>
          </ul>
        </div>

        <div className={styles.divePanel} aria-hidden="true">
          <div className={styles.budgetHead}>
            <span>Project budget</span>
            <span className={styles.budgetTotal}>$2.57 / $20.00</span>
          </div>
          <div className={styles.budgetBar}>
            <span className={styles.budgetFill} style={{ width: "13%" }} />
          </div>
          <ul className={styles.budgetRows}>
            {rows.map((row) => (
              <li key={row.label} className={styles.budgetRow}>
                <div className={styles.budgetRowTop}>
                  <span>{row.label}</span>
                  <span>
                    {row.used}{" "}
                    <em>/ {row.cap}</em>
                  </span>
                </div>
                <div className={styles.budgetMini}>
                  <span style={{ width: `${row.pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.budgetFoot}>Enqueue blocked at 100% reserved</p>
        </div>
      </div>
    </section>
  );
}
