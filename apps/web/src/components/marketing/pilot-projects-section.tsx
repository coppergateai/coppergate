import Link from "next/link";
import { PILOT_PROJECTS } from "./pilot-projects";
import styles from "./marketing.module.css";

export function PilotProjectsSection() {
  return (
    <section
      id="projects"
      className={styles.section}
      aria-labelledby="projects-title"
    >
      <div className={styles.sectionInner}>
        <p className={styles.sectionEyebrow}>Open pilots</p>
        <h2 id="projects-title" className={styles.sectionTitle}>
          Coppergate is built by Coppergate.
        </h2>
        <p className={styles.sectionLede}>
          We dogfood Contracted Autonomy on our own repos — Open Program → spend
          license → Accept + Ship Receipt under a real cap — and ship adjacent
          open-source pilots like kprompt from the same shop.
        </p>

        <ul className={styles.pilotGrid}>
          {PILOT_PROJECTS.map((p) => (
            <li key={p.id} className={styles.pilotCard}>
              {p.logoSrcDark ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={`${styles.pilotLogo} ${styles.brandImgOnDark}`}
                    src={p.logoSrcDark}
                    alt=""
                    width={48}
                    height={54}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className={`${styles.pilotLogo} ${styles.brandImgOnLight}`}
                    src={p.logoSrc}
                    alt=""
                    width={48}
                    height={54}
                  />
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className={styles.pilotLogo}
                  src={p.logoSrc}
                  alt=""
                  width={48}
                  height={54}
                />
              )}
              <div className={styles.pilotBody}>
                <h3 className={styles.pilotName}>
                  {p.name}
                  {p.badge ? (
                    <span className={styles.pilotBadge}>{p.badge}</span>
                  ) : null}
                </h3>
                <p className={styles.pilotBlurb}>{p.blurb}</p>
                <div className={styles.pilotLinks}>
                  <a href={p.href} target="_blank" rel="noreferrer">
                    {p.href.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                  <a href={p.github} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className={styles.sectionCtas}>
          <a
            className={styles.btnSecondary}
            href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
            target="_blank"
            rel="noreferrer"
          >
            Self-host guide
          </a>
          <Link className={styles.btnSecondary} href="/login">
            Try hosted
          </Link>
          <a className={styles.inlineDocLink} href="#faq">
            FAQ →
          </a>
        </div>
      </div>
    </section>
  );
}
