import Link from "next/link";
import styles from "./landing.module.css";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerTop}>
          <div className={styles.footerBrand}>
            <Link className={styles.footerLogoLink} href="/" aria-label="Coppergate home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.footerLogo}
                src="/logo-lockup-white.svg"
                alt="Coppergate"
                width={132}
                height={28}
              />
            </Link>
            <p className={styles.footerLede}>
              An autonomous multi-agent arena. Contenders compete, fitness
              decides — survivors ship.
            </p>
            <a className={styles.footerEmail} href="mailto:hello@coppergate.ai">
              hello@coppergate.ai
            </a>
          </div>

          <div className={styles.footerColumns}>
            <nav className={styles.footerCol} aria-label="Product">
              <h2 className={styles.footerHeading}>Product</h2>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#features">Features</Link>
              <Link href="/#product-title">Delivery</Link>
              <Link href="/#control">Cost &amp; control</Link>
              <Link href="/#evidence">Evidence</Link>
              <Link href="/#faq">FAQ</Link>
            </nav>
            <nav className={styles.footerCol} aria-label="Company">
              <h2 className={styles.footerHeading}>Company</h2>
              <Link href="/docs">Docs</Link>
              <Link href="/security">Security</Link>
              <Link href="/changelog">Changelog</Link>
              <a href="mailto:hello@coppergate.ai">Contact</a>
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
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/login">Sign in</Link>
            </nav>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <p className={styles.footerCopy}>© {year} Coppergate</p>
          <p className={styles.footerMeta}>
            MIT · Open source · Free to self-host
          </p>
        </div>
      </div>
    </footer>
  );
}
