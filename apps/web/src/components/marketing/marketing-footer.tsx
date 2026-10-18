import Link from "next/link";
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
              Set a budget. Agents war. Survivors ship.
            </p>
            <a className={styles.footerEmail} href="mailto:hello@coppergate.ai">
              hello@coppergate.ai
            </a>
          </div>

          <div className={styles.footerCols}>
            <nav className={styles.footerCol} aria-label="Product">
              <h2>Product</h2>
              <Link href="/#arena">Arena</Link>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#evidence">Evidence</Link>
              <Link href="/#fitness">Fitness</Link>
              <Link href="/#signals">Integrations</Link>
              <Link href="/#controls">Controls</Link>
              <Link href="/#faq">FAQ</Link>
            </nav>
            <nav className={styles.footerCol} aria-label="Resources">
              <h2>Resources</h2>
              <Link href="/docs">Documentation</Link>
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
              <h2>Company</h2>
              <Link href="/security">Security</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <a href="mailto:hello@coppergate.ai">Contact</a>
            </nav>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p>© {year} Coppergate</p>
          <p>Private beta · Design-partner onboarding</p>
        </div>
      </div>
    </footer>
  );
}
