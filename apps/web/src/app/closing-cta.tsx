import Link from "next/link";
import styles from "./landing.module.css";

export function ClosingCta() {
  return (
    <section className={styles.closing} aria-labelledby="closing-title">
      <div className={styles.closingInner}>
        <p className={styles.closingEyebrow}>Get started</p>
        <h2 id="closing-title" className={styles.closingTitle}>
          Put delivery behind a gate.
        </h2>
        <p className={styles.closingLede}>
          Private beta for teams that want AI-written PRs with evidence — and a
          human hand on merge.
        </p>
        <div className={styles.closingActions}>
          <Link className={styles.closingPrimary} href="/#early-access">
            Request access
          </Link>
          <Link className={styles.closingSecondary} href="/#how-it-works">
            See how it works
          </Link>
        </div>
      </div>
    </section>
  );
}
