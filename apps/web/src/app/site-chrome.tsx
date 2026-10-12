import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import {
  AnnouncementBar,
  MarketingFooter,
  MarketingHeader,
} from "@/components/marketing";
import styles from "@/components/marketing/marketing.module.css";

export async function SiteChrome({ children }: { children: ReactNode }) {
  const user = await currentUser();

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.atmWash} />
        <div className={styles.atmGrid} />
      </div>

      <AnnouncementBar />
      <MarketingHeader signedIn={Boolean(user)} />

      <div className={styles.main}>{children}</div>

      <MarketingFooter />
    </div>
  );
}
