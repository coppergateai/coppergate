import type { ReactNode } from "react";
import { SiteChrome } from "@/app/site-chrome";
import styles from "@/components/marketing/marketing.module.css";
import { DocsNav } from "./docs-nav";

export function DocsShell({ children }: { children: ReactNode }) {
  return (
    <SiteChrome>
      <div className={styles.docsLayout}>
        <aside className={styles.docsAside}>
          <DocsNav />
        </aside>
        <div className={styles.docsMain}>{children}</div>
      </div>
    </SiteChrome>
  );
}
