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
          Ready to run the arena
          <br />
          on your terms.
        </h2>
        <p className={styles.finalLede}>
          Start with the MIT source and a spend cap — or open the hosted
          instance to explore. Either path ends in a reviewable PR, not a chat
          transcript. Community pricing stays $0.
        </p>

        <div className={styles.finalActions}>
          <a
            className={styles.btnHeroPrimary}
            href={SELF_HOST}
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
            <IconArrow />
          </a>
          <a
            className={styles.btnSecondary}
            href={REPO}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub
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
            : (
              <>
                Free forever to self-host.{" "}
                <Link href="/docs/pricing">Pricing</Link>
                {" · "}
                <Link href="/docs/limitations">Limitations</Link>
                {" · "}
                hello@coppergate.ai
              </>
            )}
        </p>
      </div>
    </section>
  );
}
