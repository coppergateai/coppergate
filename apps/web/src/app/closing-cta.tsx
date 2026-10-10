import Link from "next/link";
import { EarlyAccessForm } from "./early-access-form";
import styles from "./landing.module.css";

type Props = {
  signedInLogin?: string | null;
};

export function ClosingCta({ signedInLogin = null }: Props) {
  return (
    <section
      id="get-started"
      className={styles.closing}
      aria-labelledby="closing-title"
    >
      <div className={styles.closingInner}>
        <p className={styles.closingEyebrow}>Get started</p>
        <h2 id="closing-title" className={styles.closingTitle}>
          Arm the arena. Survive to ship.
        </h2>
        <p className={styles.closingLede}>
          Private beta for builders who want autonomous agents that compete.
          Today: GitHub fitness + spend caps + kill-switch. Next: full Survivor
          tournament.
        </p>
        <div className={styles.closingForm}>
          <EarlyAccessForm signedInLogin={signedInLogin} />
        </div>
        <p className={styles.closingNote}>
          Or{" "}
          <Link href="/#how-it-works">see how it works</Link>
          {" · "}
          <Link href="/changelog">Changelog</Link>
        </p>
      </div>
    </section>
  );
}
