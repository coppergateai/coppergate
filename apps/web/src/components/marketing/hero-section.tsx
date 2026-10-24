import Link from "next/link";
import { HeroMissionMock } from "./hero-mission-mock";
import { IconArrow } from "./icons";
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
          <div className={styles.heroBadgeRow}>
            <span className={styles.openSourceBadge}>Open source</span>
            <span className={styles.heroBadgeMeta}>MIT · Free to self-host</span>
          </div>

          <h1 id="hero-title" className={styles.headline}>
            Set a budget. Agents war.
            <br />
            <span className={styles.headlineAccent}> Survivors ship.</span>
          </h1>

          <p className={styles.lede}>
            Coppergate runs autonomous engineering agents inside a spend cap —
            from proposal to verified pull request. Contenders compete; fitness
            and evidence decide; you review what ships.
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
            <Link className={styles.btnSecondary} href={primaryHref}>
              Open workspaces
            </Link>
          </div>

          <ul className={styles.trustList}>
            <li>Self-host or cloud</li>
            <li>Bring your own LLM</li>
            <li>Production ready</li>
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
