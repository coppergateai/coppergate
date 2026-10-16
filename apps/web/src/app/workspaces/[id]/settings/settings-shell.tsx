"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./settings.module.css";

export const SETTINGS_TABS = [
  {
    id: "connections",
    label: "Connections",
    blurb: "GitHub & GitLab",
  },
  {
    id: "general",
    label: "General",
    blurb: "Workspace & budgets",
  },
  {
    id: "billing",
    label: "Billing",
    blurb: "Hosted Starter & Pro",
  },
  {
    id: "signals",
    label: "Signals",
    blurb: "Adapters & notify",
  },
  {
    id: "llm",
    label: "LLM",
    blurb: "Bring your own key",
  },
  {
    id: "analytics",
    label: "Analytics",
    blurb: "Spend by source",
  },
  {
    id: "danger",
    label: "Danger",
    blurb: "Delete workspace",
  },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

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
          </p>
        </div>
        <div className={styles.shellHeadAside}>
          <p className={styles.shellActiveLabel}>{activeMeta.label}</p>
          <p className={styles.shellActiveBlurb}>{activeMeta.blurb}</p>
        </div>
      </header>

      <nav className={styles.tabNav} aria-label="Settings sections">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${styles.tabBtn} ${
              active === t.id ? styles.tabBtnActive : ""
            } ${t.id === "danger" ? styles.tabBtnDanger : ""}`}
            aria-current={active === t.id ? "page" : undefined}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={styles.tabPanel} key={active}>
        {panels[active]}
      </div>
    </div>
  );
}
