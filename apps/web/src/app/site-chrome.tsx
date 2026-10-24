import type { ReactNode } from "react";
import {
  AnnouncementBar,
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing";
import styles from "@/components/marketing/marketing.module.css";

/**
 * Static marketing chrome (no cookie reads). Auth CTAs resolve client-side so
 * document metadata can flush into <head> without waiting on the session.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.atmWash} />
        <div className={styles.atmGrid} />
      </div>

      <AnnouncementBar />
      <MarketingHeader />

      <main id="main-content" className={styles.main}>
        {children}
      </main>

      <MarketingFooter />
    </div>
  );
}
