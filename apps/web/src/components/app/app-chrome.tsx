"use client";

import { useState, type ReactNode } from "react";
import {
  AppSidebar,
  type SidebarUser,
  type SidebarWorkspace,
} from "./app-sidebar";
import styles from "./app.module.css";

export function AppChrome({
  workspaces,
  user,
  children,
}: {
  workspaces: SidebarWorkspace[];
  user?: SidebarUser | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.shell}>
      {open ? (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <AppSidebar
        workspaces={workspaces}
        user={user}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className={styles.main}>
        <div className={styles.topbar}>
          <button
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <path
                fill="currentColor"
                d="M2 4.5h14v1.5H2V4.5zm0 4h14V10H2V8.5zm0 4h14V14H2v-1.5z"
              />
            </svg>
          </button>
          <span className={styles.topbarBrand}>Coppergate</span>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
