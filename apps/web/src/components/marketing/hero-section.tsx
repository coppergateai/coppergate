import { HeroMissionMock } from "./hero-mission-mock";
import { HostedCtaLink } from "./hosted-cta-link";
import { IconArrow } from "./icons";
import styles from "./marketing.module.css";

export function HeroSection() {
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroInner}>
        <div className={`${styles.heroCopy} cg-rise`}>
          <p className={styles.heroBrand}>Coppergate</p>

          <h1 id="hero-title" className={styles.headline}>
            Autonomy under contract.
            <br />
            <span className={styles.headlineAccent}>
              {" "}
              Only what&apos;s on the program ships.
            </span>
          </h1>

          <p className={styles.lede}>
            Open Program Runtime binds spend, Survivor Arena, and Accept to a
            living program line — not a chat session. No Open ID, no spend;
            Accept writes Done plus a Ship Receipt you can audit.
          </p>

          <div className={styles.ctaRow}>
            <a
              className={styles.btnHeroPrimary}
              href="https://github.com/coppergateai/coppergate"
              target="_blank"
              rel="noreferrer"
            >
              Start on GitHub
              <IconArrow />
            </a>
            <HostedCtaLink className={styles.btnSecondary} />
          </div>

          <ul className={styles.trustList}>
            <li>MIT · Community $0</li>
            <li>Program-bound spend</li>
            <li>Accept → Ship Receipt</li>
          </ul>
        </div>

        <div className={`${styles.heroVisual} cg-rise cg-rise-delay-2`}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <HeroMissionMock />
        </div>
      </div>
    </section>
  );
}
