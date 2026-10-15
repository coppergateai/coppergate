import Link from "next/link";
import { IconArrow } from "./icons";
import { ProductPreview } from "./product-preview";
import styles from "./marketing.module.css";

type Props = {
  signedIn: boolean;
};

const workflow = [
  {
    label: "Task",
    detail: "Brief or inbound signal defines the engineering goal.",
  },
  {
    label: "Competing agents",
    detail: "Multiple contenders attempt the same objective in parallel.",
  },
  {
    label: "Verification",
    detail: "Tests, CI, and policy checks score each attempt.",
  },
  {
    label: "Selected PR",
    detail: "The strongest qualifying result is prepared for review.",
  },
] as const;

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
            Give Coppergate an engineering task. Multiple AI agents compete to
            solve it. Coppergate tests their work, compares quality and cost,
            and delivers the strongest verified result as a pull request.
          </p>

          <ol className={styles.heroFlow} aria-label="Delivery workflow">
            {workflow.map((step, i) => (
              <li key={step.label} className={styles.heroFlowStep}>
                {i > 0 ? (
                  <span className={styles.heroFlowArrow} aria-hidden="true">
                    →
                  </span>
                ) : null}
                <div className={styles.heroFlowCard}>
                  <span className={styles.heroFlowLabel}>{step.label}</span>
                  <span className={styles.heroFlowDetail}>{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>

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
          <ProductPreview compact />
        </div>
      </div>
    </section>
  );
}
