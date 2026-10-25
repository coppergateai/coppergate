import styles from "./hero-mission-mock.module.css";

const NAV = [
  "Overview",
  "Program",
  "Arena",
  "Evidence",
  "Activity",
  "Settings",
] as const;

const RECEIPT = {
  openId: "AG-011",
  title: "WAITING_CI / lease honesty under Pause",
  spend: "$0.42",
  fitness: "0.91",
  ci: "Green",
  profile: "engineer",
  touches: "1",
  writeback: "OPEN_PROGRAM → Done",
} as const;

/** Illustrative Program → Receipt frame for the marketing hero. */
export function HeroMissionMock() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.window}>
        <aside className={styles.side}>
          <p className={styles.sideBrand}>Coppergate</p>
          <nav className={styles.sideNav}>
            {NAV.map((item) => (
              <span
                key={item}
                className={`${styles.sideLink} ${
                  item === "Evidence" ? styles.sideLinkActive : ""
                }`}
              >
                {item}
              </span>
            ))}
          </nav>
        </aside>

        <div className={styles.main}>
          <header className={styles.top}>
            <div>
              <p className={styles.crumb}>Workspaces / coppergate / Evidence</p>
              <p className={styles.title}>Ship Receipt</p>
            </div>
            <div className={styles.actions}>
              <span className={styles.btnGhost}>Share</span>
              <span className={styles.btnStop}>Open program</span>
            </div>
          </header>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={`${styles.statDot} ${styles.dot_run}`} />
              <div>
                <p className={styles.statValue}>{RECEIPT.openId}</p>
                <p className={styles.statLabel}>Open ID</p>
              </div>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.statDot} ${styles.dot_wait}`} />
              <div>
                <p className={styles.statValue}>{RECEIPT.spend}</p>
                <p className={styles.statLabel}>Spend</p>
              </div>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.statDot} ${styles.dot_idle}`} />
              <div>
                <p className={styles.statValue}>{RECEIPT.fitness}</p>
                <p className={styles.statLabel}>Fitness</p>
              </div>
            </div>
            <div className={styles.stat}>
              <span className={`${styles.statDot} ${styles.dot_attn}`} />
              <div>
                <p className={styles.statValue}>{RECEIPT.ci}</p>
                <p className={styles.statLabel}>CI</p>
              </div>
            </div>
          </div>

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Field</span>
              <span>Value</span>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.row}>
              <div className={styles.proj}>
                <span className={styles.projMark} />
                <div>
                  <p className={styles.projName}>Title</p>
                  <p className={styles.projMeta}>{RECEIPT.title}</p>
                </div>
              </div>
              <span className={`${styles.badge} ${styles.badge_run}`}>
                Accepted
              </span>
              <div className={styles.activity}>
                <span>Winner · {RECEIPT.profile}</span>
                <span>Human touches · {RECEIPT.touches}</span>
              </div>
              <span className={styles.cost}>{RECEIPT.writeback}</span>
            </div>
            <div className={styles.row}>
              <div className={styles.proj}>
                <span className={styles.projMark} />
                <div>
                  <p className={styles.projName}>Program cycle</p>
                  <p className={styles.projMeta}>
                    Open Program → Spend License → Survivor → Receipt
                  </p>
                </div>
              </div>
              <span className={`${styles.badge} ${styles.badge_wait}`}>
                Contracted
              </span>
              <div className={styles.activity}>
                <span>No Open ID</span>
                <span>No spend</span>
              </div>
              <span className={styles.cost}>Fail-closed</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
