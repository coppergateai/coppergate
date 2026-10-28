import Link from "next/link";
import { HostedCtaLink } from "./hosted-cta-link";
import { IconArrow } from "./icons";
import { MarketingLottie } from "./marketing-lottie";
import styles from "./marketing.module.css";

const REPO = "https://github.com/coppergateai/coppergate";
const SELF_HOST = `${REPO}/blob/main/docs/SELF_HOST.md`;

export function FinalCta() {
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
          Ready for autonomy{" "}
          <span className={styles.finalTitleBreak}>under contract.</span>
        </h2>
        <p className={styles.finalLede}>
          Bind an Open Program, set a spend cap, and let survivors earn Accept
          — with a Ship Receipt, not a chat transcript. Community pricing stays
          $0.
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
          <HostedCtaLink className={styles.btnSecondary} />
        </div>

        <p id="early-access" className={styles.finalNote}>
          Free forever to self-host.{" "}
          <Link href="/docs/pricing">Pricing</Link>
          {" · "}
          <Link href="/docs/limitations">Limitations</Link>
          {" · "}
          <a href="#projects">Coppergate is built by Coppergate</a>
          {" · "}
          hello@coppergate.ai
        </p>
      </div>
    </section>
  );
}
