"use client";

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
    id: "analytics",
    label: "Analytics",
    blurb: "Spend by source",
    group: "Spend",
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
  workspaceName: string;
  workspaceSlug: string;
  role: string;
  initialTab?: string;
  panels: Record<SettingsTabId, ReactNode>;
};

export function SettingsShell({
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
        <div className={styles.shellHeadMain}>
          <h1 className={styles.title}>Workspace settings</h1>
          <p className={styles.meta}>
            {workspaceName} · /{workspaceSlug} · {role}
            <span className={styles.metaSep} aria-hidden>
              ·
            </span>
            <span className={styles.metaActive}>{activeMeta.label}</span>
            <span className={styles.metaBlurb}> — {activeMeta.blurb}</span>
          </p>
        </div>
      </header>

      <nav className={styles.tabNav} aria-label="Settings sections">
        {GROUP_ORDER.map((group) => {
          const tabs = SETTINGS_TABS.filter((t) => t.group === group);
          if (tabs.length === 0) return null;
          return (
            <div key={group} className={styles.tabGroup}>
              <p className={styles.tabGroupLabel}>{group}</p>
              <div className={styles.tabGroupRow}>
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`${styles.tabBtn} ${
                      active === t.id ? styles.tabBtnActive : ""
                    } ${t.id === "danger" ? styles.tabBtnDanger : ""}`}
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
