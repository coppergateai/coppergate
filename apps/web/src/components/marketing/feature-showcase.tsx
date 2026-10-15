import styles from "./marketing.module.css";

export function FeatureShowcase() {
  return (
    <section
      id="features"
      className={`${styles.section} ${styles.features}`}
      aria-labelledby="features-title"
    >
      <div className={styles.sectionInner}>
        <p className={styles.sectionEyebrow}>Product</p>
        <h2 id="features-title" className={styles.sectionTitle}>
          Control-plane clarity for autonomous delivery.
        </h2>
        <p className={styles.sectionLede}>
          Marketing previews of the arena loop. Demo values are illustrative —
          live product surfaces use your workspace data.
        </p>

        <div className={styles.featureGrid}>
          <article className={styles.featureCard} id="evidence">
            <div className={styles.featureCopy}>
              <p className={styles.sectionEyebrow}>Tournament</p>
              <h3>Multiple approaches. One validated winner.</h3>
              <p>
                Contenders compete on the same goal. Fitness ranking and
                elimination pressure select what deserves promotion — not the
                first agent to finish.
              </p>
            </div>
            <div className={styles.featureVisual} aria-hidden="true">
              <span className={styles.miniLabel}>Demo · Contender compare</span>
              <ul className={styles.miniList}>
                <li>
                  <span>Contender A</span>
                  <span className={styles.tagWin}>0.91</span>
                </li>
                <li>
                  <span>Contender B</span>
                  <span>0.76</span>
                </li>
                <li>
                  <span>Contender C</span>
                  <span className={styles.tagOut}>Eliminated</span>
                </li>
              </ul>
            </div>
          </article>

          <article className={styles.featureCard} id="control">
            <div className={styles.featureCopy}>
              <p className={styles.sectionEyebrow}>Budget</p>
              <h3>Every agent operates within limits.</h3>
              <p>
                Spend caps and reservations act as selection pressure. Weak
                paths exhaust budget; arena-level stops prevent runaway cost.
              </p>
            </div>
            <div className={styles.featureVisual} aria-hidden="true">
              <span className={styles.miniLabel}>Demo · Budget</span>
              <div className={styles.budgetRows}>
                <div className={styles.budgetRow}>
                  <div className={styles.budgetTop}>
                    <span>Total</span>
                    <span>$50.00</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: "100%" }} />
                  </div>
                </div>
                <div className={styles.budgetRow}>
                  <div className={styles.budgetTop}>
                    <span>Used</span>
                    <span>$18.40</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: "37%" }} />
                  </div>
                </div>
                <div className={styles.budgetRow}>
                  <div className={styles.budgetTop}>
                    <span>Reserved</span>
                    <span>$12.00</span>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={styles.barFillMuted} style={{ width: "24%" }} />
                  </div>
                </div>
              </div>
            </div>
          </article>

          <article className={styles.featureCard}>
            <div className={styles.featureCopy}>
              <p className={styles.sectionEyebrow}>Evidence</p>
              <h3>Decisions backed by evidence.</h3>
              <p>
                Critic scores, CI, Sonar gates, coverage deltas, e2e, and diffs
                travel with the survivor path — promotion is inspectable, not a
                black box.
              </p>
            </div>
            <div className={styles.featureVisual} aria-hidden="true">
              <span className={styles.miniLabel}>Demo · Fitness pack</span>
              <div className={styles.metricGrid}>
                <div className={styles.metric}>
                  <span className={styles.metricKey}>Critic</span>
                  <span className={`${styles.metricVal} ${styles.metricWarn}`}>
                    0.91
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricKey}>Sonar</span>
                  <span className={`${styles.metricVal} ${styles.metricOk}`}>
                    Pass
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricKey}>CI</span>
                  <span className={`${styles.metricVal} ${styles.metricOk}`}>
                    Green
                  </span>
                </div>
                <div className={styles.metric}>
                  <span className={styles.metricKey}>E2E</span>
                  <span className={`${styles.metricVal} ${styles.metricOk}`}>
                    Pass
                  </span>
                </div>
              </div>
            </div>
          </article>

          <article className={styles.featureCard}>
            <div className={styles.featureCopy}>
              <p className={styles.sectionEyebrow}>Kill-switch</p>
              <h3>Autonomy without losing control.</h3>
              <p>
                Policies, spend limits, pause, and stop controls stay in your
                hands. Demo controls below are illustrative only — not wired to
                production actions.
              </p>
            </div>
            <div className={styles.featureVisual} aria-hidden="true">
              <span className={styles.miniLabel}>Demo · Control plane</span>
              <div className={styles.killPanel}>
                <div className={styles.killRow}>
                  <span>Policy gate</span>
                  <span className={styles.tagRun}>Enforced</span>
                </div>
                <div className={styles.killRow}>
                  <span>Spend limit</span>
                  <span>$50 hard stop</span>
                </div>
                <div className={styles.killRow}>
                  <span>Arena state</span>
                  <span>Paused</span>
                </div>
                <div className={styles.killRow}>
                  <span>Emergency</span>
                  <span className={styles.killStop}>Kill-switch</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
