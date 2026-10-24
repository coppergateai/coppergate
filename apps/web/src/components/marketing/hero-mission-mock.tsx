import styles from "./hero-mission-mock.module.css";

const NAV = [
  "Overview",
  "Projects",
  "Arena",
  "Inbox",
  "Activity",
  "Settings",
] as const;

const STATS = [
  { label: "Running", value: "3", tone: "run" as const },
  { label: "Awaiting CI", value: "3", tone: "wait" as const },
  { label: "Idle", value: "3", tone: "idle" as const },
  { label: "Needs attention", value: "1", tone: "attn" as const },
] as const;

const PROJECTS = [
  {
    name: "kprompt",
    status: "Running",
    tone: "run" as const,
    agents: "12 agents",
    last: "2m ago",
    runs: "18 runs",
    merges: "6 merges",
    cost: "$0.97",
    spark: [40, 55, 48, 70, 62, 80, 74],
  },
  {
    name: "kprompt-architecture",
    status: "Awaiting CI",
    tone: "wait" as const,
    agents: "10 agents",
    last: "8m ago",
    runs: "11 runs",
    merges: "4 merges",
    cost: "$0.42",
    spark: [30, 42, 38, 50, 46, 58, 52],
  },
  {
    name: "kprompt-examples",
    status: "Running",
    tone: "run" as const,
    agents: "8 agents",
    last: "14m ago",
    runs: "9 runs",
    merges: "3 merges",
    cost: "$0.31",
    spark: [22, 35, 40, 36, 48, 44, 60],
  },
  {
    name: "kprompt-dash",
    status: "Idle",
    tone: "idle" as const,
    agents: "6 agents",
    last: "1h ago",
    runs: "4 runs",
    merges: "1 merge",
    cost: "$0.12",
    spark: [18, 20, 16, 22, 19, 24, 21],
  },
] as const;

function Spark({ values }: { values: readonly number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 48;
      const y = 16 - ((v - min) / span) * 12;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className={styles.spark} viewBox="0 0 48 18" aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

/** Illustrative Mission Control frame for the marketing hero. */
export function HeroMissionMock() {
  return (
    <div className={styles.frame} aria-hidden="true">
      <div className={styles.window}>
        <aside className={styles.side}>
          <p className={styles.sideBrand}>kprompt</p>
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
              <p className={styles.crumb}>Workspaces / kprompt / Arena</p>
              <h3 className={styles.title}>Arena</h3>
            </div>
            <div className={styles.actions}>
              <span className={styles.btnGhost}>Pause all</span>
              <span className={styles.btnStop}>Stop all</span>
            </div>
          </header>

          <div className={styles.stats}>
            {STATS.map((s) => (
              <div key={s.label} className={styles.stat}>
                <span className={`${styles.statDot} ${styles[`dot_${s.tone}`]}`} />
                <div>
                  <p className={styles.statValue}>{s.value}</p>
                  <p className={styles.statLabel}>{s.label}</p>
                </div>
              </div>
            ))}
            <div className={`${styles.stat} ${styles.statSpark}`}>
              <div>
                <p className={styles.statValue}>12</p>
                <p className={styles.statLabel}>Runs (30d)</p>
              </div>
              <Spark values={[28, 36, 32, 48, 44, 60, 55, 70]} />
            </div>
          </div>

          <div className={styles.table}>
            <div className={styles.tableHead}>
              <span>Project</span>
              <span>Status</span>
              <span>Activity</span>
              <span>Cost (30d)</span>
              <span />
            </div>
            {PROJECTS.map((p) => (
              <div key={p.name} className={styles.row}>
                <div className={styles.proj}>
                  <span className={styles.projMark} />
                  <div>
                    <p className={styles.projName}>{p.name}</p>
                    <p className={styles.projMeta}>{p.agents}</p>
                  </div>
                </div>
                <span className={`${styles.badge} ${styles[`badge_${p.tone}`]}`}>
                  {p.status}
                </span>
                <div className={styles.activity}>
                  <span>{p.last}</span>
                  <span>
                    {p.runs} · {p.merges}
                  </span>
                </div>
                <span className={styles.cost}>{p.cost}</span>
                <Spark values={p.spark} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
