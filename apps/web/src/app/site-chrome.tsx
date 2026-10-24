import { Suspense, type ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import {
  AnnouncementBar,
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing";
import styles from "@/components/marketing/marketing.module.css";

async function AuthAwareHeader() {
  const user = await currentUser();
  return <MarketingHeader signedIn={Boolean(user)} />;
}

/**
 * Marketing chrome. Auth is Suspense-bound so cookie reads do not delay
 * streamed document metadata into the body (critical for SEO).
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
      <Suspense fallback={<MarketingHeader signedIn={false} />}>
        <AuthAwareHeader />
      </Suspense>

      <main id="main-content" className={styles.main}>
        {children}
      </main>

      <MarketingFooter />
    </div>
  );
}
