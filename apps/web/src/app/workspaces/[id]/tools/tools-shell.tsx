"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "../shared/catalog.module.css";

export type ToolRow = {
  key: string;
  title: string;
  kind: "core" | "mcp" | "alias";
  description: string;
  agents: Array<{ key: string; displayName: string }>;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  tools: ToolRow[];
  initialKey?: string | null;
};

export function ToolsShell({
  workspaceId,
  workspaceName,
  isOwner,
  tools,
  initialKey,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && tools.some((t) => t.key === initialKey)
      ? initialKey
      : (tools[0]?.key ?? null),
  );

  const selected = useMemo(
    () => tools.find((t) => t.key === selectedKey) ?? null,
    [tools, selectedKey],
  );

  const coreCount = tools.filter((t) => t.kind === "core").length;
  const mcpCount = tools.filter((t) => t.kind === "mcp").length;

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Tools</h1>
          <div className={styles.headLinks}>
            <Link
              href={`/workspaces/${workspaceId}/agents`}
              className={styles.headLink}
            >
              Agents →
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/skills`}
              className={styles.headLink}
            >
              Skills →
            </Link>
            {isOwner ? (
              <Link
                href={`/workspaces/${workspaceId}/settings?tab=llm`}
                className={styles.headLink}
              >
                Configure →
              </Link>
            ) : null}
          </div>
        </div>
        <p className={styles.lede}>
          Capability tokens on agent allowlists — what each profile may read,
          edit, test, or call via MCP. Escalation beyond the system catalog is
          refused.
        </p>
        <div className={styles.summaryStrip} aria-label="Tools summary">
          <span>
            <strong>{tools.length}</strong> tools
          </span>
          <span>
            <strong>{coreCount}</strong> core
          </span>
          <span>
            <strong>{mcpCount}</strong> MCP
          </span>
        </div>
      </header>

      <div
        className={`${styles.layout} ${selected ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Tool catalog">
          <ul className={styles.itemList}>
            {tools.map((t) => {
              const active = t.key === selectedKey;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setSelectedKey(t.key)}
                  >
                    <p className={styles.itemName}>{t.title}</p>
                    <p className={styles.itemKey}>{t.key}</p>
                    <p className={styles.itemMeta}>
                      <span>{t.kind}</span>
                      <span>
                        {t.agents.length} agent
                        {t.agents.length === 1 ? "" : "s"}
                      </span>
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detailPane} aria-live="polite">
          {!selected ? (
            <div className={styles.emptyDetail}>
              <strong>Select a tool</strong>
              <p className={styles.note}>
                Pick a tool to see what it allows and which agents may use it.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setSelectedKey(null)}
              >
                ← All tools
              </button>
              <div className={styles.detailHead}>
                <h2 className={styles.detailTitle}>{selected.title}</h2>
                <p className={styles.detailKey}>{selected.key}</p>
                <div className={styles.chipRow}>
                  <span className={styles.chip}>{selected.kind}</span>
                  <span className={styles.chip}>
                    {selected.agents.length} agent
                    {selected.agents.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>What it does</h3>
                <p className={styles.bodyBlock}>{selected.description}</p>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Granted to agents</h3>
                {selected.agents.length === 0 ? (
                  <p className={styles.note}>
                    No profile currently grants this tool.
                  </p>
                ) : (
                  <ul className={styles.relatedList}>
                    {selected.agents.map((a) => (
                      <li key={a.key}>
                        <Link
                          href={`/workspaces/${workspaceId}/agents?agent=${encodeURIComponent(a.key)}`}
                          className={styles.relatedItem}
                        >
                          <p className={styles.relatedTitle}>{a.displayName}</p>
                          <p className={styles.relatedMeta}>{a.key}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <div className={styles.footerActions}>
                <Link
                  href={`/workspaces/${workspaceId}/agents`}
                  className={styles.footerLink}
                >
                  Browse agents →
                </Link>
                <Link
                  href={`/workspaces/${workspaceId}/skills`}
                  className={styles.footerLink}
                >
                  Browse skills →
                </Link>
                {isOwner ? (
                  <Link
                    href={`/workspaces/${workspaceId}/settings?tab=llm`}
                    className={styles.footerLink}
                  >
                    Edit allowlists →
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
