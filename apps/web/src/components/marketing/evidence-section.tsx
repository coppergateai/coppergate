import {
  ILLUSTRATIVE_ARENA,
  ILLUSTRATIVE_CONTENDERS,
  formatUsd,
} from "./arena-demo-data";
import styles from "./marketing.module.css";

const winner =
  ILLUSTRATIVE_CONTENDERS.find((c) => c.statusTone === "win") ??
  ILLUSTRATIVE_CONTENDERS[0]!;
const rejected = ILLUSTRATIVE_CONTENDERS.filter((c) => c.id !== winner.id);

export function EvidenceSection() {
  return (
    <section
      id="evidence"
      className={`${styles.section} ${styles.evidenceSection}`}
      aria-labelledby="evidence-title"
    >
      <div className={styles.sectionInner}>
        <header className={styles.workflowHead}>
          <p className={styles.sectionEyebrow}>Verification evidence</p>
          <h2 id="evidence-title" className={styles.sectionTitle}>
            Every winner comes with evidence.
          </h2>
          <p className={styles.sectionLede}>
            See what was built, what passed, what failed, what it cost, and why
            it was selected. Promotion is an inspectable report — not a black
            box.
          </p>
          <p className={styles.demoNotice}>
            <span className={styles.demoNoticeMark}>
              {ILLUSTRATIVE_ARENA.label}
            </span>
            Report layout mirrors product fitness artifacts; values are sample.
          </p>
        </header>

        <div className={styles.evidenceReport}>
          <div className={styles.evidenceReportHead}>
            <div>
              <p className={styles.evidenceReportKicker}>Execution report</p>
              <h3 className={styles.evidenceReportTitle}>
                {ILLUSTRATIVE_ARENA.task}
              </h3>
            </div>
            <span className={styles.statusPillWin}>Survivor selected</span>
          </div>

          <div className={styles.evidenceColumns}>
            <article className={styles.evidenceBlock}>
              <h4>Code</h4>
              <dl>
                <div>
                  <dt>Repository</dt>
                  <dd>{ILLUSTRATIVE_ARENA.repo}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>
                    <code>{ILLUSTRATIVE_ARENA.branch}</code>
                  </dd>
                </div>
                <div>
                  <dt>Commit</dt>
                  <dd>
                    <code>{ILLUSTRATIVE_ARENA.commitSha}</code>
                  </dd>
                </div>
                <div>
                  <dt>Pull request</dt>
                  <dd>PR #{ILLUSTRATIVE_ARENA.prNumber} (ready for review)</dd>
                </div>
                <div>
                  <dt>Changed files</dt>
                  <dd>checkout.ts · cart-lock.ts · checkout.test.ts</dd>
                </div>
              </dl>
            </article>

            <article className={styles.evidenceBlock}>
              <h4>Verification</h4>
              <dl>
                <div>
                  <dt>Test suite</dt>
                  <dd>
                    {winner.testsPassed} passed · {winner.testsFailed} failed
                  </dd>
                </div>
                <div>
                  <dt>CI</dt>
                  <dd>{winner.ci}</dd>
                </div>
                <div>
                  <dt>Lint / static analysis</dt>
                  <dd>{winner.lint}</dd>
                </div>
                <div>
                  <dt>Failed checks</dt>
                  <dd>None on survivor</dd>
                </div>
                <div>
                  <dt>Verified</dt>
                  <dd>After tournament resolve</dd>
                </div>
              </dl>
            </article>

            <article className={styles.evidenceBlock}>
              <h4>Evaluation</h4>
              <dl>
                <div>
                  <dt>Fitness</dt>
                  <dd>{winner.fitness.toFixed(2)}</dd>
                </div>
                <div>
                  <dt>Efficiency</dt>
                  <dd>{winner.efficiency.toFixed(3)}</dd>
                </div>
                <div>
                  <dt>Criteria</dt>
                  <dd>{ILLUSTRATIVE_ARENA.criteria.join(" · ")}</dd>
                </div>
                <div>
                  <dt>Selection</dt>
                  <dd>{ILLUSTRATIVE_ARENA.selectionReason}</dd>
                </div>
                <div>
                  <dt>Others</dt>
                  <dd>
                    {rejected
                      .map((c) => `${c.name}: ${c.rejectionReason}`)
                      .join(" · ")}
                  </dd>
                </div>
              </dl>
            </article>

            <article className={styles.evidenceBlock}>
              <h4>Execution</h4>
              <dl>
                <div>
                  <dt>Total spend</dt>
                  <dd>{formatUsd(ILLUSTRATIVE_ARENA.totalSpendUsd)}</dd>
                </div>
                <div>
                  <dt>Budget limit</dt>
                  <dd>{formatUsd(ILLUSTRATIVE_ARENA.budgetUsd)}</dd>
                </div>
                <div>
                  <dt>Attempts</dt>
                  <dd>{ILLUSTRATIVE_ARENA.attempts} contenders</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{ILLUSTRATIVE_ARENA.duration}</dd>
                </div>
                <div>
                  <dt>Final state</dt>
                  <dd>{ILLUSTRATIVE_ARENA.runState}</dd>
                </div>
              </dl>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
