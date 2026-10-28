import Link from "next/link";
import { PILOT_PROJECTS } from "./pilot-projects";
import styles from "./marketing.module.css";

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <Link className={styles.brandLink} href="/" aria-label="Coppergate home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`${styles.footerLogo} ${styles.brandImgOnDark}`}
                src="/logo-lockup-white.svg"
                alt="Coppergate"
                width={132}
                height={28}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={`${styles.footerLogo} ${styles.brandImgOnLight}`}
                src="/logo-lockup-black.svg"
                alt="Coppergate"
                width={132}
                height={28}
              />
            </Link>
            <p className={styles.footerLede}>
              Autonomy under contract. Only what&apos;s on the program ships.
            </p>
            <p className={styles.footerNote}>
              Coppergate is built by Coppergate — and ships adjacent open-source
              pilots like ACPP and kprompt.
            </p>
            <a className={styles.footerEmail} href="mailto:hello@coppergate.ai">
              hello@coppergate.ai
            </a>
          </div>

          <div className={styles.footerCols}>
            <nav className={styles.footerCol} aria-label="Product">
              <p className={styles.footerColTitle}>Product</p>
              <Link href="/#arena">Arena</Link>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#evidence">Evidence</Link>
              <Link href="/#fitness">Fitness</Link>
              <Link href="/#signals">Integrations</Link>
              <Link href="/#controls">Controls</Link>
              <Link href="/#faq">FAQ</Link>
            </nav>
            <nav className={styles.footerCol} aria-label="Pilot projects">
              <p className={styles.footerColTitle}>Pilot projects</p>
              {PILOT_PROJECTS.map((p) => (
                <a
                  key={p.id}
                  href={p.href}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.footerProject}
                >
                  <span className={styles.footerProjectRow}>
                    {p.logoSrcDark ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className={`${styles.footerProjectLogo} ${styles.brandImgOnDark}`}
                          src={p.logoSrcDark}
                          alt=""
                          width={20}
                          height={22}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className={`${styles.footerProjectLogo} ${styles.brandImgOnLight}`}
                          src={p.logoSrc}
                          alt=""
                          width={20}
                          height={22}
                        />
                      </>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className={styles.footerProjectLogo}
                        src={p.logoSrc}
                        alt=""
                        width={20}
                        height={22}
                      />
                    )}
                    <span className={styles.footerProjectName}>{p.name}</span>
                  </span>
                  <span className={styles.footerProjectBlurb}>{p.blurb}</span>
                </a>
              ))}
              <Link href="/#projects">All pilots →</Link>
            </nav>
            <nav className={styles.footerCol} aria-label="Resources">
              <p className={styles.footerColTitle}>Resources</p>
              <Link href="/docs">Documentation</Link>
              <Link href="/docs/open-program-runtime">Open Program Runtime</Link>
              <Link href="/docs/pricing">Pricing</Link>
              <Link href="/blog">Blog</Link>
              <a
                href="https://github.com/coppergateai/coppergate/blob/main/docs/SELF_HOST.md"
                target="_blank"
                rel="noreferrer"
              >
                Self-host
              </a>
              <Link href="/changelog">Changelog</Link>
              <a
                href="https://github.com/coppergateai/coppergate"
                target="_blank"
                rel="noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://x.com/coppergateai"
                target="_blank"
                rel="noreferrer"
              >
                X
              </a>
              <a
                href="https://www.instagram.com/coppergateai/"
                target="_blank"
                rel="noreferrer"
              >
                Instagram
              </a>
            </nav>
            <nav className={styles.footerCol} aria-label="Company">
              <p className={styles.footerColTitle}>Company</p>
              <Link href="/security">Security</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <a href="mailto:hello@coppergate.ai">Contact</a>
            </nav>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© {year} Coppergate</p>
          <p>MIT · Open source · Dogfood + ACPP + kprompt</p>
        </div>
      </div>
    </footer>
  );
}
