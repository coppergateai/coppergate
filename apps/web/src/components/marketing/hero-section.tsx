import Link from "next/link";
import { HeroMissionMock } from "./hero-mission-mock";
import { IconArrow } from "./icons";
import styles from "./marketing.module.css";

type Props = {
  signedIn: boolean;
};

export function HeroSection({ signedIn }: Props) {
  const hostedHref = signedIn ? "/workspaces" : "/login";
  const hostedLabel = signedIn ? "Open workspaces" : "Try hosted";

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.heroInner}>
        <div className={`${styles.heroCopy} cg-rise`}>
          <p className={styles.heroBrand}>Coppergate</p>

          <h1 id="hero-title" className={styles.headline}>
            Set a budget. Agents war.
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
            <Link className={styles.btnSecondary} href={hostedHref}>
              {hostedLabel}
            </Link>
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
