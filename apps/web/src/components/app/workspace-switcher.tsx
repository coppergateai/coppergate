"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { SidebarWorkspace } from "./app-sidebar";
import { useWorkspaceNav } from "./workspace-nav-context";
import styles from "./app.module.css";

type Props = {
  workspaces: SidebarWorkspace[];
  onNavigate?: () => void;
};

export function WorkspaceSwitcher({ workspaces, onNavigate }: Props) {
  const nav = useWorkspaceNav();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!nav) return null;

  const filtered = workspaces.filter((ws) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      ws.name.toLowerCase().includes(needle) ||
      ws.slug.toLowerCase().includes(needle)
    );
  });

  return (
    <div className={styles.switcher} ref={rootRef}>
      <button
        type="button"
        className={styles.workspaceChip}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.workspaceChipName}>{nav.workspaceName}</span>
        <span className={styles.workspaceChipMeta}>
          /{nav.workspaceSlug} · Switch
        </span>
      </button>
      {open ? (
        <div id={listId} className={styles.switcherPopover} role="listbox">
          <input
            className={styles.switcherSearch}
            autoFocus
            placeholder="Search workspaces…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className={styles.switcherList}>
            {filtered.map((ws) => (
              <li key={ws.id}>
                <Link
                  href={`/workspaces/${ws.id}/projects`}
                  className={
                    ws.id === nav.workspaceId
                      ? `${styles.switcherItem} ${styles.switcherItemActive}`
                      : styles.switcherItem
                  }
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                >
                  <span className={styles.switcherItemName}>{ws.name}</span>
                  <span className={styles.switcherItemMeta}>/{ws.slug}</span>
                </Link>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className={styles.switcherEmpty}>No workspaces</li>
            ) : null}
          </ul>
          <Link
            href="/workspaces"
            className={styles.switcherFooter}
            onClick={() => {
              setOpen(false);
              onNavigate?.();
            }}
          >
            View all workspaces
          </Link>
        </div>
      ) : null}
    </div>
  );
}
