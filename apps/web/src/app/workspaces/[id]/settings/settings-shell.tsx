"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./settings.module.css";

export const SETTINGS_TABS = [
  {
    id: "connections",
    label: "Connections",
    blurb: "Source control",
    group: "Connections",
  },
  {
    id: "general",
    label: "General",
    blurb: "Workspace & budgets",
    group: "Workspace",
  },
  {
    id: "billing",
    label: "Billing",
    blurb: "Usage & plan status",
    group: "Spend",
  },
  {
    id: "signals",
    label: "Signals",
    blurb: "Adapters & notify",
    group: "Workspace",
  },
  {
    id: "llm",
    label: "LLM",
    blurb: "Keys & agent routing",
    group: "Advanced",
  },
  {
    id: "danger",
    label: "Danger",
    blurb: "Delete workspace",
    group: "Advanced",
  },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

const GROUP_ORDER = ["Connections", "Workspace", "Spend", "Advanced"] as const;

function isTabId(value: string | null): value is SettingsTabId {
  return SETTINGS_TABS.some((t) => t.id === value);
}

type Props = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  role: string;
  initialTab?: string;
  panels: Record<SettingsTabId, ReactNode>;
};

export function SettingsShell({
  workspaceId,
  workspaceName,
  workspaceSlug,
  role,
  initialTab,
  panels,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("tab");
  const resolved: SettingsTabId = isTabId(fromUrl)
    ? fromUrl
    : isTabId(initialTab ?? null)
      ? (initialTab as SettingsTabId)
      : "connections";

  const [tab, setTab] = useState<SettingsTabId>(resolved);
  const active = isTabId(fromUrl) ? fromUrl : tab;

  const select = useCallback(
    (id: SettingsTabId) => {
      setTab(id);
      const next = new URLSearchParams(searchParams.toString());
      next.set("tab", id);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activeMeta = useMemo(
    () => SETTINGS_TABS.find((t) => t.id === active) ?? SETTINGS_TABS[0],
    [active],
  );

  return (
    <div className={styles.shell}>
      <header className={styles.shellHead}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Settings</h1>
          <div className={styles.headActions}>
            <nav className={styles.headLinks} aria-label="Related">
              <Link
                href={`/workspaces/${workspaceId}/agents`}
                className={styles.headLink}
              >
                Agents
              </Link>
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link
                href={`/workspaces/${workspaceId}/tools`}
                className={styles.headLink}
              >
                Tools
              </Link>
              <span className={styles.headSep} aria-hidden>
                ·
              </span>
              <Link
                href={`/workspaces/${workspaceId}/insights`}
                className={styles.headLink}
              >
                Insights
              </Link>
            </nav>
          </div>
        </div>
        <p className={styles.lede}>
          Connections, spend, signals, and model routing for this workspace —
          owners change settings; everyone can review them.
        </p>
        <div className={styles.summaryStrip} aria-label="Settings context">
          <span className={styles.summaryItem}>
            <strong>/{workspaceSlug}</strong>
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{role}</strong>
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{activeMeta.label}</strong>
            <span className={styles.summaryMute}> — {activeMeta.blurb}</span>
          </span>
        </div>
      </header>

      <nav className={styles.tabNav} aria-label="Settings sections">
        {GROUP_ORDER.map((group) => {
          const tabs = SETTINGS_TABS.filter((t) => t.group === group);
          if (tabs.length === 0) return null;
          return (
            <div key={group} className={styles.tabGroup}>
              <p className={styles.tabGroupLabel}>{group}</p>
              <div className={styles.tabGroupRow} role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    className={`${styles.tabBtn} ${
                      active === t.id ? styles.tabBtnActive : ""
                    } ${t.id === "danger" ? styles.tabBtnDanger : ""}`}
                    aria-selected={active === t.id}
                    aria-current={active === t.id ? "page" : undefined}
                    onClick={() => select(t.id)}
                    title={t.blurb}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className={styles.tabPanel} key={active}>
        {panels[active]}
      </div>
    </div>
  );
}
