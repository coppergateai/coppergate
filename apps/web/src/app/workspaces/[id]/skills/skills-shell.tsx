"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "../shared/catalog.module.css";

export type SkillRow = {
  key: string;
  title: string;
  bodyMarkdown: string;
  version: number;
  workspaceOverride: boolean;
  agents: Array<{ key: string; displayName: string }>;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  skills: SkillRow[];
  initialKey?: string | null;
};

export function SkillsShell({
  workspaceId,
  workspaceName,
  isOwner,
  skills,
  initialKey,
}: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && skills.some((s) => s.key === initialKey)
      ? initialKey
      : (skills[0]?.key ?? null),
  );

  const selected = useMemo(
    () => skills.find((s) => s.key === selectedKey) ?? null,
    [skills, selectedKey],
  );

  const attached = skills.filter((s) => s.agents.length > 0).length;

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Skills</h1>
          <div className={styles.headLinks}>
            <Link
              href={`/workspaces/${workspaceId}/agents`}
              className={styles.headLink}
            >
              Agents →
            </Link>
            <Link
              href={`/workspaces/${workspaceId}/tools`}
              className={styles.headLink}
            >
              Tools →
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
          Procedures injected into agent runs — PR hygiene, security, design,
          reliability, and more. Expand a skill to read the full playbook.
        </p>
        <div className={styles.summaryStrip} aria-label="Skills summary">
          <span>
            <strong>{skills.length}</strong> skills
          </span>
          <span>
            <strong>{attached}</strong> attached to agents
          </span>
          <span>
            <strong>
              {skills.filter((s) => s.workspaceOverride).length}
            </strong>{" "}
            workspace overrides
          </span>
        </div>
      </header>

      <div
        className={`${styles.layout} ${selected ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Skill catalog">
          <ul className={styles.itemList}>
            {skills.map((s) => {
              const active = s.key === selectedKey;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => setSelectedKey(s.key)}
                  >
                    <p className={styles.itemName}>{s.title}</p>
                    <p className={styles.itemKey}>{s.key}</p>
                    <p className={styles.itemMeta}>
                      <span>v{s.version}</span>
                      <span>
                        {s.agents.length} agent
                        {s.agents.length === 1 ? "" : "s"}
                      </span>
                      {s.workspaceOverride ? <span>override</span> : null}
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
              <strong>Select a skill</strong>
              <p className={styles.note}>
                Pick a skill to read its procedure and which agents use it.
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setSelectedKey(null)}
              >
                ← All skills
              </button>
              <div className={styles.detailHead}>
                <h2 className={styles.detailTitle}>{selected.title}</h2>
                <p className={styles.detailKey}>
                  {selected.key} · v{selected.version}
                  {selected.workspaceOverride
                    ? " · workspace override"
                    : " · system"}
                </p>
                <div className={styles.chipRow}>
                  <span className={styles.chip}>
                    {selected.agents.length} agent
                    {selected.agents.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Procedure</h3>
                <pre className={styles.bodyBlock}>{selected.bodyMarkdown}</pre>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Used by agents</h3>
                {selected.agents.length === 0 ? (
                  <p className={styles.note}>
                    Not attached to any profile in this workspace.
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
                {isOwner ? (
                  <Link
                    href={`/workspaces/${workspaceId}/settings?tab=llm`}
                    className={styles.footerLink}
                  >
                    Edit skill attachments →
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
