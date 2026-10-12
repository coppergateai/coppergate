import Link from "next/link";
import { IconArrow } from "./icons";
import { ProductPreview } from "./product-preview";
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
          <p className={styles.eyebrow}>Build inside the gate</p>
          <h1 id="hero-title" className={styles.headline}>
            Agents compete.
            <br />
            <span className={styles.headlineAccent}>Survivors ship.</span>
          </h1>
          <p className={styles.lede}>
            An <span className={styles.ledeEm}>autonomous</span> multi-agent
            arena. Contenders race, critics evaluate, and{" "}
            <span className={styles.ledeEm}>efficiency</span> decides what
            survives — selection over supervision. You define the goal, budget,
            and boundaries.
          </p>
          <div className={styles.ctaRow}>
            <Link className={styles.btnHeroPrimary} href={primaryHref}>
              Open workspaces
              <IconArrow />
            </Link>
            <Link className={styles.btnSecondary} href="/#how-it-works">
              Explore the workflow
            </Link>
          </div>
          <p className={styles.metaRow}>
            Private beta · GitHub-native · Budget-controlled
          </p>
        </div>

        <div className={`${styles.heroVisual} cg-rise cg-rise-delay-2`}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
