"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../shared/catalog.module.css";

export type SkillRow = {
  key: string;
  title: string;
  bodyMarkdown: string;
  version: number;
  workspaceOverride: boolean;
  /** true when there is no system seed for this key */
  isCustom: boolean;
  agents: Array<{ key: string; displayName: string }>;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  skills: SkillRow[];
  initialKey?: string | null;
};

type FormState = {
  key: string;
  title: string;
  bodyMarkdown: string;
};

export function SkillsShell({
  workspaceId,
  workspaceName,
  isOwner,
  skills: initialSkills,
  initialKey,
}: Props) {
  const router = useRouter();
  const [skills, setSkills] = useState(initialSkills);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && initialSkills.some((s) => s.key === initialKey)
      ? initialKey
      : (initialSkills[0]?.key ?? null),
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    key: "",
    title: "",
    bodyMarkdown: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setSkills(initialSkills);
  }, [initialSkills]);

  const selected = useMemo(
    () => skills.find((s) => s.key === selectedKey) ?? null,
    [skills, selectedKey],
  );

  const attached = skills.filter((s) => s.agents.length > 0).length;

  function startCreate() {
    setCreating(true);
    setEditing(false);
    setForm({ key: "", title: "", bodyMarkdown: "" });
    setError(null);
    setOk(null);
  }

  function startEdit(s: SkillRow) {
    setCreating(false);
    setEditing(true);
    setForm({
      key: s.key,
      title: s.title,
      bodyMarkdown: s.bodyMarkdown,
    });
    setError(null);
    setOk(null);
  }

  function cancelEditor() {
    setCreating(false);
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (!isOwner) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/skills`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: creating ? form.key : (selected?.key ?? form.key),
          title: form.title,
          bodyMarkdown: form.bodyMarkdown,
        }),
      });
      const body = (await res.json()) as {
        error?: { message: string };
        skill?: { key: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      setOk(`Saved ${body.skill?.key ?? form.key}`);
      setCreating(false);
      setEditing(false);
      setSelectedKey(body.skill?.key ?? form.key);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function deleteSelected() {
    if (!isOwner || !selected?.workspaceOverride) return;
    const label = selected.isCustom
      ? `Delete ${selected.key}?`
      : "Reset to system skill?";
    if (!window.confirm(label)) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/skills?key=${encodeURIComponent(selected.key)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Delete failed");
      setOk(
        selected.isCustom
          ? `Deleted ${selected.key}`
          : `Reset ${selected.key}`,
      );
      setEditing(false);
      if (selected.isCustom) setSelectedKey(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  const showEditor = isOwner && (creating || editing);

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Skills</h1>
          <div className={styles.headLinks}>
            {isOwner ? (
              <button
                type="button"
                className={styles.newBtn}
                onClick={startCreate}
                disabled={pending}
              >
                New skill
              </button>
            ) : null}
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
          </div>
        </div>
        <p className={styles.lede}>
          Procedures injected into agent runs — PR hygiene, security, design,
          reliability, and more. Owners can create overrides or custom skills.
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

      {error ? (
        <p className={styles.error} style={{ margin: "0.5rem var(--app-pad-x-lg)" }}>
          {error}
        </p>
      ) : null}
      {ok ? (
        <p className={styles.ok} style={{ margin: "0.5rem var(--app-pad-x-lg)" }}>
          {ok}
        </p>
      ) : null}

      <div
        className={`${styles.layout} ${selected || creating ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Skill catalog">
          <ul className={styles.itemList}>
            {skills.map((s) => {
              const active = !creating && s.key === selectedKey;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setSelectedKey(s.key);
                      setCreating(false);
                      setEditing(false);
                    }}
                  >
                    <p className={styles.itemName}>{s.title}</p>
                    <p className={styles.itemKey}>{s.key}</p>
                    <p className={styles.itemMeta}>
                      <span>v{s.version}</span>
                      <span>
                        {s.agents.length} agent
                        {s.agents.length === 1 ? "" : "s"}
                      </span>
                      {s.isCustom ? (
                        <span>custom</span>
                      ) : s.workspaceOverride ? (
                        <span>override</span>
                      ) : null}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detailPane} aria-live="polite">
          {showEditor ? (
            <div className={styles.editor}>
              <h2 className={styles.detailTitle}>
                {creating ? "New skill" : `Edit ${selected?.title}`}
              </h2>
              {creating ? (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="skill-key">
                    Key
                  </label>
                  <input
                    id="skill-key"
                    className={styles.input}
                    value={form.key}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, key: e.target.value }))
                    }
                    placeholder="my-skill"
                    disabled={pending}
                  />
                </div>
              ) : null}
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="skill-title">
                  Title
                </label>
                <input
                  id="skill-title"
                  className={styles.input}
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="skill-body">
                  Procedure (markdown)
                </label>
                <textarea
                  id="skill-body"
                  className={styles.textarea}
                  value={form.bodyMarkdown}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bodyMarkdown: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.btnRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={pending}
                  onClick={() => void save()}
                >
                  Save
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  disabled={pending}
                  onClick={cancelEditor}
                >
                  Cancel
                </button>
                {!creating && selected?.workspaceOverride ? (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={pending}
                    onClick={() => void deleteSelected()}
                  >
                    {selected.isCustom ? "Delete" : "Reset to system"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!creating && !selected ? (
            <div className={styles.emptyDetail}>
              <strong>Select a skill</strong>
              <p className={styles.note}>
                Pick a skill to read its procedure and which agents use it.
              </p>
            </div>
          ) : null}

          {!creating && selected && !editing ? (
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
                  {selected.isCustom
                    ? " · custom"
                    : selected.workspaceOverride
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

              {isOwner ? (
                <div className={styles.btnRow} style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => startEdit(selected)}
                    disabled={pending}
                  >
                    Edit
                  </button>
                  {selected.workspaceOverride ? (
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={pending}
                      onClick={() => void deleteSelected()}
                    >
                      {selected.isCustom ? "Delete" : "Reset to system"}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Procedure</h3>
                <pre className={styles.bodyBlock}>{selected.bodyMarkdown}</pre>
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Used by agents</h3>
                {selected.agents.length === 0 ? (
                  <p className={styles.note}>
                    Not attached to any profile — attach from Agents → Edit.
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
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
