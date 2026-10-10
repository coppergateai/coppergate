import styles from "./landing.module.css";

const events = [
  { t: "14:02", label: "brief.approved", detail: "You approved the product brief" },
  { t: "14:05", label: "run.started", detail: "Worker claimed coding run" },
  { t: "14:11", label: "checks.passed", detail: "CI · 24 tests" },
  { t: "14:12", label: "pr.opened", detail: "#128 feat: subscription tracker MVP" },
  { t: "14:13", label: "review.required", detail: "Merge locked · awaiting you" },
] as const;

export function EvidenceDive() {
  return (
    <section
      id="evidence"
      className={styles.dive}
      aria-labelledby="evidence-title"
    >
      <div className={styles.diveInner}>
        <div className={styles.diveCopy}>
          <p className={styles.diveEyebrow}>Evidence &amp; trace</p>
          <h2 id="evidence-title" className={styles.diveTitle}>
            Every step leaves a trail you can inspect.
          </h2>
          <p className={styles.diveLede}>
            From brief approval to PR open, Coppergate records run events,
            checks, and cost — so review starts from signal, not a chat scroll
            you cannot audit.
          </p>
          <ul className={styles.divePoints}>
            <li>Structured run events from queue to review</li>
            <li>CI, diffs, and spend attached to the PR story</li>
            <li>Approval decisions stay visible in your inbox</li>
          </ul>
        </div>

        <div className={styles.divePanel} aria-hidden="true">
          <div className={styles.traceHead}>
            <span className={styles.traceBadge}>Run #128</span>
            <span>REVIEW_REQUIRED</span>
          </div>
          <ul className={styles.traceList}>
            {events.map((event) => (
              <li key={event.label}>
                <time>{event.t}</time>
                <div>
                  <strong>{event.label}</strong>
                  <span>{event.detail}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.traceFoot}>
            <span className={styles.tracePass}>CI · passing</span>
            <span className={styles.traceCost}>$1.84</span>
            <span>+182 −14</span>
          </div>
        </div>
      </div>
    </section>
  );
}
