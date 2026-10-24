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
            Set a budget. Agents compete.
            <br />
            <span className={styles.headlineAccent}> Survivors ship.</span>
          </h1>

          <p className={styles.lede}>
            For engineering teams who want agents that ship pull requests — not
            chat transcripts. Contenders compete inside a spend cap; fitness and
            evidence decide; you review what survives.
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
            <li>Self-host or hosted</li>
            <li>Bring your own LLM</li>
            <li>Issue → verified PR</li>
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
