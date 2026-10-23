import Link from "next/link";
import { HeroArenaStory } from "./hero-arena-story";
import { IconArrow } from "./icons";
import { MarketingLottie } from "./marketing-lottie";
import styles from "./marketing.module.css";

type Props = {
  signedIn: boolean;
};

export function HeroSection({ signedIn }: Props) {
  const primaryHref = signedIn ? "/workspaces" : "/login";

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroInner}>
        <div className={`${styles.heroCopy} cg-rise`}>
          <div className={styles.eyebrowRow}>
            <MarketingLottie
              src="/lottie/arena-pulse.json"
              className={styles.lottieEyebrow}
              label="Arena pulse"
            />
            <p className={styles.eyebrow}>Budget in. Selection out.</p>
          </div>
          <h1 id="hero-title" className={styles.headline}>
            Set a budget. Agents war.
            <br />
            <span className={styles.headlineAccent}>Survivors ship.</span>
          </h1>
          <p className={styles.lede}>
            Coppergate builds your project inside a spend cap — from $5/mo.
            Contenders fight the same work; weak agents lose budget and get
            eliminated; strong agents win, ship, and improve. Selection
            pressure is the cost optimizer.
          </p>

          <div className={styles.ctaRow}>
            <a
              className={styles.btnHeroPrimary}
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
            >
              Star on GitHub
              <IconArrow />
            </a>
            <Link className={styles.btnSecondary} href={primaryHref}>
              {signedIn ? "Open workspaces" : "Try hosted"}
            </Link>
          </div>
          <p className={styles.metaRow}>
            MIT · free to self-host · BYOK · survivors improve
          </p>
        </div>

        <div className={`${styles.heroVisual} cg-rise cg-rise-delay-2`}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <HeroArenaStory signedIn={signedIn} />
        </div>
      </div>
    </section>
  );
}
