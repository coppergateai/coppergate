import styles from "./landing.module.css";

const events = [
  { t: "14:02", label: "arena.armed", detail: "Goal + budget + kill-switch set" },
  { t: "14:05", label: "tournament.started", detail: "3 contenders claimed the task" },
  { t: "14:11", label: "fitness.scored", detail: "CI · critic 0.91" },
  { t: "14:12", label: "winner.promoted", detail: "#128 feat: subscription tracker MVP" },
  { t: "14:13", label: "contender.eliminated", detail: "Budget exhausted · 2 out" },
] as const;

export function EvidenceDive() {
  return (
    <section
      id="evidence-trace"
      className={styles.dive}
      aria-labelledby="evidence-title"
    >
      <div className={styles.diveInner}>
        <div className={styles.diveCopy}>
          <p className={styles.diveEyebrow}>Evidence &amp; trace</p>
          <h2 id="evidence-title" className={styles.diveTitle}>
            Every fight leaves a trail you can inspect.
          </h2>
          <p className={styles.diveLede}>
            From arena arm to elimination, Coppergate records contenders,
            fitness, and cost — so autonomy is auditable, not a black box.
          </p>
          <ul className={styles.divePoints}>
            <li>Tournament and elimination events</li>
            <li>CI, diffs, critic scores, and spend on the winner path</li>
            <li>Kill-switch and policy actions stay visible</li>
          </ul>
        </div>

        <div className={styles.divePanel} aria-hidden="true">
          <div className={styles.traceHead}>
            <span className={styles.traceBadge}>Arena #128</span>
            <span>SURVIVOR</span>
          </div>
          <ol className={styles.traceList}>
            {events.map((event) => (
              <li key={event.label}>
                <time>{event.t}</time>
                <div>
                  <code>{event.label}</code>
                  <span>{event.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
