"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MarkdownProse } from "@/components/markdown-prose";
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

type AgentGrant = {
  key: string;
  displayName: string;
  skillKeys: string[];
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  skills: SkillRow[];
  allAgents?: AgentGrant[];
  initialKey?: string | null;
};

type FormState = {
  key: string;
  title: string;
  bodyMarkdown: string;
};

type KindFilter = "all" | "attached" | "system" | "override" | "custom";

function sourceLabel(s: SkillRow): string {
  if (s.isCustom) return "custom";
  if (s.workspaceOverride) return "override";
  return "system";
}

export function SkillsShell({
  workspaceId,
  workspaceName,
  isOwner,
  skills: initialSkills,
  allAgents: initialAgents = [],
  initialKey,
}: Props) {
  const router = useRouter();
  const [skills, setSkills] = useState(initialSkills);
  const [allAgents, setAllAgents] = useState(initialAgents);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && initialSkills.some((s) => s.key === initialKey)
      ? initialKey
      : (initialSkills[0]?.key ?? null),
  );
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
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
  useEffect(() => {
    setAllAgents(initialAgents);
  }, [initialAgents]);

  async function setSkillOnAgent(
    agentKey: string,
    skillKey: string,
    attach: boolean,
  ) {
    if (!isOwner) return;
    const agent = allAgents.find((a) => a.key === agentKey);
    if (!agent) return;
    const next = attach
      ? [...new Set([...agent.skillKeys, skillKey])]
      : agent.skillKeys.filter((k) => k !== skillKey);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: agentKey, skillKeys: next }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Update failed");
      setAllAgents((rows) =>
        rows.map((a) =>
          a.key === agentKey ? { ...a, skillKeys: next } : a,
        ),
      );
      setOk(
        attach
          ? `Granted ${skillKey} → ${agentKey}`
          : `Removed ${skillKey} from ${agentKey}`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!selectedKey || creating) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("skill") === selectedKey) return;
    url.searchParams.set("skill", selectedKey);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, {
      scroll: false,
    });
  }, [selectedKey, creating, router]);

  const selected = useMemo(
    () => skills.find((s) => s.key === selectedKey) ?? null,
    [skills, selectedKey],
  );

  const attached = skills.filter((s) => s.agents.length > 0).length;
  const overrideCount = skills.filter((s) => s.workspaceOverride).length;
  const customCount = skills.filter((s) => s.isCustom).length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s) => {
      if (kindFilter === "attached" && s.agents.length === 0) return false;
      if (kindFilter === "system" && (s.isCustom || s.workspaceOverride)) {
        return false;
      }
      if (kindFilter === "override" && !s.workspaceOverride) return false;
      if (kindFilter === "custom" && !s.isCustom) return false;
      if (!q) return true;
      return (
        s.key.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.bodyMarkdown.toLowerCase().includes(q) ||
        s.agents.some(
          (a) =>
            a.key.toLowerCase().includes(q) ||
            a.displayName.toLowerCase().includes(q),
        )
      );
    });
  }, [skills, query, kindFilter]);

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

  function selectSkill(key: string) {
    setSelectedKey(key);
    setCreating(false);
    setEditing(false);
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
  const kindFilters: KindFilter[] = [
    "all",
    "attached",
    "system",
    "override",
    "custom",
  ];

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Skills</h1>
          <div className={styles.headActions}>
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
            </nav>
          </div>
        </div>
        <p className={styles.lede}>
          Procedures injected into agent runs — PR hygiene, security, design,
          reliability, and more. Owners can create overrides or custom skills.
        </p>
        <div className={styles.summaryStrip} aria-label="Skills summary">
          <span className={styles.summaryItem}>
            <strong>{skills.length}</strong> skills
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{attached}</strong> attached
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{overrideCount}</strong> overrides
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{customCount}</strong> custom
          </span>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div
        className={`${styles.layout} ${selected || creating ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Skill catalog">
          <input
            type="search"
            className={styles.filter}
            placeholder="Filter skills…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter skills"
          />
          <div className={styles.kindFilters} role="group" aria-label="Kind">
            {kindFilters.map((k) => (
              <button
                key={k}
                type="button"
                className={`${styles.kindChip} ${kindFilter === k ? styles.kindChipActive : ""}`}
                onClick={() => setKindFilter(k)}
                aria-pressed={kindFilter === k}
              >
                {k}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <p className={styles.emptyList}>
              No skills match
              {query.trim() ? ` “${query.trim()}”` : " this filter"}.
            </p>
          ) : (
            <ul className={styles.itemList}>
              {filtered.map((s) => {
                const active = !creating && s.key === selectedKey;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => selectSkill(s.key)}
                    >
                      <span className={styles.itemName}>{s.title}</span>
                      <span className={styles.itemAside}>
                        {s.agents.length > 0
                          ? `${s.agents.length} agent${s.agents.length === 1 ? "" : "s"}`
                          : "—"}
                      </span>
                      <span className={styles.itemKey}>{s.key}</span>
                      <span className={styles.itemMeta}>
                        v{s.version}
                        <span className={styles.metaSep} aria-hidden>
                          ·
                        </span>
                        {sourceLabel(s)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
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
                <div className={styles.detailHeadMain}>
                  <h2 className={styles.detailTitle}>{selected.title}</h2>
                  <p className={styles.detailKey}>
                    {selected.key} · v{selected.version} · {sourceLabel(selected)}
                  </p>
                  <div className={styles.chipRow}>
                    <span className={styles.chip}>
                      {selected.agents.length} agent
                      {selected.agents.length === 1 ? "" : "s"}
                    </span>
                    <span className={styles.chip}>{sourceLabel(selected)}</span>
                  </div>
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
                <MarkdownProse
                  className={styles.bodyProse}
                  markdown={selected.bodyMarkdown}
                />
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Grant to agents</h3>
                <p className={styles.note}>
                  Runtime injects at most 4 skills (~6k chars) into the prompt.
                </p>
                {allAgents.length === 0 ? (
                  <p className={styles.note}>No agents in this workspace.</p>
                ) : (
                  <div className={styles.checkGrid}>
                    {allAgents.map((a) => {
                      const on = a.skillKeys.includes(selected.key);
                      return (
                        <label key={a.key} className={styles.checkItem}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!isOwner || pending}
                            onChange={(e) =>
                              void setSkillOnAgent(
                                a.key,
                                selected.key,
                                e.target.checked,
                              )
                            }
                          />
                          {a.displayName}
                          <span className={styles.relatedMeta}> {a.key}</span>
                        </label>
                      );
                    })}
                  </div>
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
                  href={`/workspaces/${workspaceId}/tools`}
                  className={styles.footerLink}
                >
                  Browse tools →
                </Link>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
