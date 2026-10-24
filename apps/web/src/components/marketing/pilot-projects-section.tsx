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
        <p className={styles.sectionEyebrow}>Pilot projects</p>
        <h2 id="projects-title" className={styles.sectionTitle}>
          Also building in the open.
        </h2>
        <p className={styles.sectionLede}>
          Same shop, different surfaces — adjacent open-source pilots we build
          and maintain alongside Coppergate.
        </p>

        <ul className={styles.pilotGrid}>
          {PILOT_PROJECTS.map((p) => (
            <li key={p.id} className={styles.pilotCard}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.pilotLogo}
                src={p.logoSrc}
                alt=""
                width={48}
                height={54}
              />
              <div className={styles.pilotBody}>
                <h3 className={styles.pilotName}>{p.name}</h3>
                <p className={styles.pilotBlurb}>{p.blurb}</p>
                <div className={styles.pilotLinks}>
                  <a href={p.href} target="_blank" rel="noreferrer">
                    {p.href.replace(/^https?:\/\//, "")}
                  </a>
                  <a href={p.github} target="_blank" rel="noreferrer">
                    GitHub
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
