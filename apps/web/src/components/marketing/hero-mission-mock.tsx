import styles from "./hero-mission-mock.module.css";

const NAV = [
  "Overview",
  "Arena",
  "Inbox",
  "Insights",
  "Projects",
  "Settings",
] as const;

const CONTENDERS = [
  {
    name: "engineer · opus",
    meta: "Waiting CI · $0.42",
    fitness: "0.91",
    status: "Survivor",
    tone: "win" as const,
  },
  {
    name: "engineer · sonnet",
    meta: "Rejected · fitness gate",
    fitness: "0.74",
    status: "Out",
    tone: "out" as const,
  },
  {
    name: "reviewer · haiku",
    meta: "Eliminated · spend",
    fitness: "0.61",
    status: "Out",
    tone: "out" as const,
  },
] as const;

/** Illustrative Arena frame for the marketing hero — mirrors product chrome. */
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
                  item === "Arena" ? styles.sideLinkActive : ""
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
              <p className={styles.eyebrow}>Arena / coppergate</p>
              <p className={styles.title}>WAITING_CI / lease honesty</p>
              <p className={styles.lede}>
                Contenders compete under budget. Fitness and CI decide the
                survivor — Accept writes the Ship Receipt.
              </p>
            </div>
            <div className={styles.actions}>
              <span className={styles.btnGhost}>Pause</span>
              <span className={styles.btnStop}>Accept</span>
            </div>
          </header>

          <div className={styles.summaryStrip}>
            <span>
              <strong>$0.42</strong> of $5.00
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span>
              <strong>3</strong> contenders
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span>
              <strong>1</strong> survivor
            </span>
            <span className={styles.summaryDot} aria-hidden>
              ·
            </span>
            <span className={styles.pillLive}>
              <span className={styles.pillDot} />
              Live
            </span>
          </div>

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Contender</span>
              <span>Fitness</span>
              <span>Status</span>
            </div>
            {CONTENDERS.map((c) => (
              <div
                key={c.name}
                className={`${styles.row} ${
                  c.tone === "win" ? styles.rowWin : ""
                }`}
              >
                <div className={styles.proj}>
                  <span className={styles.projMark} />
                  <div>
                    <p className={styles.projName}>{c.name}</p>
                    <p className={styles.projMeta}>{c.meta}</p>
                  </div>
                </div>
                <span className={styles.fitness}>{c.fitness}</span>
                <span
                  className={`${styles.badge} ${
                    c.tone === "win" ? styles.badge_run : styles.badge_idle
                  }`}
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
