import Link from "next/link";
import { SiteChrome } from "./site-chrome";
import styles from "./landing.module.css";

export default function NotFound() {
  return (
    <SiteChrome>
      <main className={styles.notFound}>
        <div>
          <p className={styles.notFoundCode}>404</p>
          <h1 className={styles.notFoundTitle}>This path is closed.</h1>
          <p className={styles.notFoundLede}>
            The page you’re looking for doesn’t exist — or the gate isn’t open
            for it yet.
          </p>
          <div className={styles.notFoundActions}>
            <Link className={styles.authCta} href="/">
              Back home
            </Link>
            <Link className={styles.authBack} href="/#how-it-works">
              How it works
            </Link>
          </div>
        </div>
      </main>
    </SiteChrome>
  );
}
