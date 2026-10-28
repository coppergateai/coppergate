"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  applyTheme,
  resolveInitialTheme,
  storeTheme,
  type Theme,
} from "@/lib/theme";
import { useWorkspaceNav } from "./workspace-nav-context";
import styles from "./command-palette.module.css";

type Item = {
  id: string;
  label: string;
  href?: string;
  group: string;
  action?: () => void;
};

type Props = {
  workspaces?: Array<{ id: string; name: string }>;
};

export function CommandPalette({ workspaces = [] }: Props) {
  const nav = useWorkspaceNav();
  const router = useRouter();
  const pathname = usePathname() || "/workspaces";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  const workspaceId =
    nav?.workspaceId ??
    pathname.match(/^\/workspaces\/([^/]+)/)?.[1] ??
    null;

  const items = useMemo(() => {
    const base: Item[] = [
      {
        id: "workspaces",
        label: "All workspaces",
        href: "/workspaces",
        group: "Navigate",
      },
      {
        id: "profile",
        label: "Profile",
        href: "/profile",
        group: "Navigate",
      },
      {
        id: "docs",
        label: "Documentation",
        href: "/docs",
        group: "Navigate",
      },
      {
        id: "create-ws",
        label: "Create workspace",
        href: "/workspaces#create-workspace",
        group: "Actions",
      },
      {
        id: "theme",
        label: "Toggle theme",
        group: "Actions",
        action: () => {
          const current = resolveInitialTheme();
          const next: Theme = current === "dark" ? "light" : "dark";
          applyTheme(next);
          storeTheme(next);
        },
      },
    ];

    if (workspaceId) {
      base.push(
        {
          id: "overview",
          label: "Overview",
          href: `/workspaces/${workspaceId}`,
          group: "Workspace",
        },
        {
          id: "projects",
          label: "Projects",
          href: `/workspaces/${workspaceId}/projects`,
          group: "Workspace",
        },
        {
          id: "arena",
          label: "Arena",
          href: `/workspaces/${workspaceId}/arena`,
          group: "Workspace",
        },
        {
          id: "inbox",
          label: "Inbox",
          href: `/workspaces/${workspaceId}/inbox`,
          group: "Workspace",
        },
        {
          id: "insights",
          label: "Insights",
          href: `/workspaces/${workspaceId}/insights`,
          group: "Workspace",
        },
        {
          id: "activity",
          label: "Activity",
          href: `/workspaces/${workspaceId}/activity`,
          group: "Workspace",
        },
        {
          id: "settings",
          label: "Settings",
          href: `/workspaces/${workspaceId}/settings`,
          group: "Workspace",
        },
        {
          id: "create-project",
          label: "Create project",
          href: `/workspaces/${workspaceId}/projects#create-project`,
          group: "Actions",
        },
      );
    }

    if (nav) {
      for (const p of nav.projects) {
        base.push({
          id: `p-${p.id}`,
          label: p.name,
          href: `/workspaces/${nav.workspaceId}/projects/${p.id}`,
          group: "Projects",
        });
      }
    }

    for (const ws of workspaces) {
      base.push({
        id: `ws-${ws.id}`,
        label: ws.name,
        href: `/workspaces/${ws.id}`,
        group: "Workspaces",
      });
    }

    const query = q.trim().toLowerCase();
    if (!query) return base;
    return base.filter(
      (i) =>
        i.label.toLowerCase().includes(query) ||
        i.group.toLowerCase().includes(query),
    );
  }, [nav, q, workspaceId, workspaces]);

  useEffect(() => {
    function openPalette() {
      setOpen(true);
      setQ("");
      setActive(0);
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQ("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpenEvent() {
      openPalette();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("cg:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cg:open-command-palette", onOpenEvent);
    };
  }, []);

  useEffect(() => {
    setActive(0);
  }, [q]);

  if (!open) return null;

  function go(item: Item) {
    setOpen(false);
    if (item.action) {
      item.action();
      return;
    }
    if (item.href) router.push(item.href);
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
          placeholder="Jump, create, toggle theme…"
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
              go(items[active]!);
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
                  onClick={() => go(item)}
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
