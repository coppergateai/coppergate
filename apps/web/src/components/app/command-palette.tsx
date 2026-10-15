"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceNav } from "./workspace-nav-context";
import styles from "./command-palette.module.css";

type Item = { id: string; label: string; href: string; group: string };

export function CommandPalette() {
  const nav = useWorkspaceNav();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    if (!nav) return [] as Item[];
    const base: Item[] = [
      {
        id: "projects",
        label: "Projects",
        href: `/workspaces/${nav.workspaceId}/projects`,
        group: "Workspace",
      },
      {
        id: "inbox",
        label: "Inbox",
        href: `/workspaces/${nav.workspaceId}/inbox`,
        group: "Workspace",
      },
      {
        id: "activity",
        label: "Activity",
        href: `/workspaces/${nav.workspaceId}/activity`,
        group: "Workspace",
      },
      {
        id: "settings",
        label: "Settings",
        href: `/workspaces/${nav.workspaceId}/settings`,
        group: "Workspace",
      },
    ];
    for (const p of nav.projects) {
      base.push({
        id: `p-${p.id}`,
        label: p.name,
        href: `/workspaces/${nav.workspaceId}/projects/${p.id}`,
        group: "Projects",
      });
    }
    const query = q.trim().toLowerCase();
    if (!query) return base;
    return base.filter(
      (i) =>
        i.label.toLowerCase().includes(query) ||
        i.group.toLowerCase().includes(query),
    );
  }, [nav, q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!nav || !open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div className={styles.root} role="dialog" aria-label="Command palette">
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close"
        onClick={() => setOpen(false)}
      />
      <div className={styles.panel}>
        <input
          className={styles.input}
          autoFocus
          placeholder="Jump to project, inbox, settings…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              go(items[active]!.href);
            }
          }}
        />
        <ul className={styles.list}>
          {items.length === 0 ? (
            <li className={styles.empty}>No matches</li>
          ) : (
            items.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={
                    i === active
                      ? `${styles.item} ${styles.itemActive}`
                      : styles.item
                  }
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item.href)}
                >
                  <span className={styles.itemGroup}>{item.group}</span>
                  <span className={styles.itemLabel}>{item.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className={styles.hint}>⌘K / Ctrl+K · ↑↓ · Enter</p>
      </div>
    </div>
  );
}
