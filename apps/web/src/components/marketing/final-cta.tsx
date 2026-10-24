import Link from "next/link";
import { IconArrow } from "./icons";
import { MarketingLottie } from "./marketing-lottie";
import styles from "./marketing.module.css";

type Props = {
  signedInLogin?: string | null;
};

const REPO = "https://github.com/coppergateai/coppergate";
const SELF_HOST = `${REPO}/blob/main/docs/SELF_HOST.md`;

export function FinalCta({ signedInLogin = null }: Props) {
  const signedIn = Boolean(signedInLogin);

  return (
    <section
      id="get-started"
      className={styles.final}
      aria-labelledby="final-title"
    >
      <div className={styles.finalInner}>
        <div className={styles.finalHead}>
          <div className={styles.sectionEyebrowRow}>
            <p className={styles.sectionEyebrow}>Open source</p>
          </div>
          <MarketingLottie
            src="/lottie/survivor-mark.json"
            className={styles.lottieFinal}
            label="Survivor mark"
            loop
          />
        </div>
        <h2 id="final-title" className={styles.finalTitle}>
          Clone it. Arm the arena.
          <br />
          Ship what survives.
        </h2>
        <p className={styles.finalLede}>
          Coppergate is MIT-licensed. Self-host with Compose and your own keys,
          or try the hosted instance. Bring a repo, set a spend cap, and review
          a verified PR — no invite gate on the community path.
        </p>

        <div className={styles.finalActions}>
          <a
            className={styles.btnHeroPrimary}
            href={REPO}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
            <IconArrow />
          </a>
          <a className={styles.btnSecondary} href={SELF_HOST} target="_blank" rel="noreferrer">
            Self-host guide
          </a>
          <Link
            className={styles.btnSecondary}
            href={signedIn ? "/workspaces" : "/login"}
          >
            {signedIn ? "Open workspaces" : "Try hosted"}
          </Link>
        </div>

        <p id="early-access" className={styles.finalNote}>
          {signedIn
            ? `Signed in as @${signedInLogin}. Open workspaces above to continue.`
            : "Questions? hello@coppergate.ai — community support, not a sales funnel."}
        </p>
      </div>
    </section>
  );
}
