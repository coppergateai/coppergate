import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./landing.module.css";

export async function SiteChrome({ children }: { children: ReactNode }) {
  const user = await currentUser();

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true">
        <div className={styles.atmWash} />
        <div className={styles.atmGrid} />
        <div className={styles.atmGrain} />
      </div>

      <SiteHeader signedIn={Boolean(user)} />

      {children}

      <SiteFooter />
    </div>
  );
}
