import Link from "next/link";
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
          Open source for engineering teams who want agents that compete inside
          a spend cap. Self-host with Compose, or try hosted — issue → verified
          PR with kill-switch and evidence.
        </p>
        <div className={styles.closingActions}>
          <a
            className={styles.btnPrimary}
            href="https://github.com/coppergateai/coppergate"
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
          </a>
          <Link
            className={styles.btnSecondary}
            href={signedInLogin ? "/workspaces" : "/login"}
          >
            {signedInLogin ? "Open workspaces" : "Try hosted"}
          </Link>
        </div>
        <p className={styles.closingNote}>
          Or{" "}
          <Link href="/#how-it-works">see how it works</Link>
          {" · "}
          <Link href="/changelog">Changelog</Link>
          {" · "}
          <a
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host
          </a>
        </p>
      </div>
    </section>
  );
}
