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
          <p className={styles.eyebrow}>Selection over supervision</p>
          <h1 id="hero-title" className={styles.headline}>
            Agents compete.
            <br />
            <span className={styles.headlineAccent}>Survivors ship.</span>
          </h1>
          <p className={styles.lede}>
            Multiple AI agents compete to solve your engineering task.
            Coppergate verifies their work, evaluates quality and cost, and
            delivers the strongest result as a pull request.
          </p>

          <div className={styles.ctaRow}>
            <Link className={styles.btnHeroPrimary} href={primaryHref}>
              Open workspaces
              <IconArrow />
            </Link>
            <a className={styles.btnSecondary} href="#arena">
              Explore a real Arena
            </a>
          </div>
          <p className={styles.metaRow}>
            Private beta · GitHub-native delivery · Budget-controlled
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
