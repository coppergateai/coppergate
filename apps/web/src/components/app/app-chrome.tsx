"use client";

import { useState, type ReactNode } from "react";
import {
  AppSidebar,
  type SidebarUser,
  type SidebarWorkspace,
} from "./app-sidebar";
import { CommandPalette } from "./command-palette";
import { ShortcutOverlay } from "./shortcut-overlay";
import { ToastProvider } from "./ui";
import { ThemeToggle } from "@/components/theme-toggle";
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
    <ToastProvider>
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
            <div className={styles.topbarRight}>
              <ThemeToggle className={styles.themeToggle} />
              <button
                type="button"
                className={styles.cmdHint}
                onClick={() => {
                  window.dispatchEvent(new Event("cg:open-command-palette"));
                }}
                aria-label="Open command palette"
              >
                <kbd>⌘K</kbd>
              </button>
            </div>
          </div>
          <div className={styles.content}>{children}</div>
        </div>
        <CommandPalette workspaces={workspaces} />
        <ShortcutOverlay />
      </div>
    </ToastProvider>
  );
}
