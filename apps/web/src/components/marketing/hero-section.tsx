import Link from "next/link";
import { HeroArenaStory } from "./hero-arena-story";
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
          <p className={styles.eyebrow}>Budget in. Selection out.</p>
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
            <Link className={styles.btnHeroPrimary} href={primaryHref}>
              {signedIn ? "Open workspaces" : "Request access"}
              <IconArrow />
            </Link>
            <a className={styles.btnSecondary} href="#arena">
              Explore Arena
            </a>
          </div>
          <p className={styles.metaRow}>
            Private beta · $5/mo micro-envelope · Survivors improve
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
