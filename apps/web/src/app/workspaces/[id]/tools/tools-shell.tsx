"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "../shared/catalog.module.css";

export type ToolRow = {
  key: string;
  title: string;
  kind: "core" | "mcp" | "alias" | "custom";
  description: string;
  /** true when this is a workspace_tool_defs row */
  workspaceOwned: boolean;
  targetToken: string | null;
  agents: Array<{ key: string; displayName: string }>;
};

type McpRow = {
  provider: string;
  displayName: string;
  enabled: boolean;
  endpointUrl: string;
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  tools: ToolRow[];
  mcpConnections: McpRow[];
  initialKey?: string | null;
};

type FormState = {
  key: string;
  title: string;
  description: string;
  kind: string;
  targetToken: string;
};

type KindFilter = "all" | "core" | "mcp" | "alias" | "custom";

function sourceLabel(t: ToolRow): string {
  if (t.workspaceOwned) return "workspace";
  return "system";
}

export function ToolsShell({
  workspaceId,
  workspaceName,
  isOwner,
  tools: initialTools,
  mcpConnections: initialMcp,
  initialKey,
}: Props) {
  const router = useRouter();
  const [tools, setTools] = useState(initialTools);
  const [mcpConnections, setMcp] = useState(initialMcp);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialKey && initialTools.some((t) => t.key === initialKey)
      ? initialKey
      : (initialTools[0]?.key ?? null),
  );
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>({
    key: "",
    title: "",
    description: "",
    kind: "custom",
    targetToken: "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    setTools(initialTools);
  }, [initialTools]);
  useEffect(() => {
    setMcp(initialMcp);
  }, [initialMcp]);

  useEffect(() => {
    if (!selectedKey || creating) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tool") === selectedKey) return;
    url.searchParams.set("tool", selectedKey);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, {
      scroll: false,
    });
  }, [selectedKey, creating, router]);

  const selected = useMemo(
    () => tools.find((t) => t.key === selectedKey) ?? null,
    [tools, selectedKey],
  );

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (kindFilter !== "all" && t.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        t.kind.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [tools, query, kindFilter]);

  const coreCount = tools.filter((t) => t.kind === "core").length;
  const mcpCount = tools.filter((t) => t.kind === "mcp").length;
  const customCount = tools.filter((t) => t.workspaceOwned).length;

  function selectTool(key: string) {
    setSelectedKey(key);
    setCreating(false);
    setEditing(false);
    setError(null);
  }

  function startCreate() {
    setCreating(true);
    setEditing(false);
    setForm({
      key: "",
      title: "",
      description: "",
      kind: "custom",
      targetToken: "",
    });
    setError(null);
    setOk(null);
  }

  function startEdit(t: ToolRow) {
    if (!t.workspaceOwned) return;
    setCreating(false);
    setEditing(true);
    setForm({
      key: t.key,
      title: t.title,
      description: t.description,
      kind: t.kind === "alias" || t.kind === "mcp" ? t.kind : "custom",
      targetToken: t.targetToken ?? "",
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
      const res = await fetch(`/api/workspaces/${workspaceId}/tools`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: creating ? form.key : (selected?.key ?? form.key),
          title: form.title,
          description: form.description,
          kind: form.kind,
          targetToken: form.targetToken || null,
        }),
      });
      const body = (await res.json()) as {
        error?: { message: string };
        tool?: { key: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Save failed");
      setOk(`Saved ${body.tool?.key ?? form.key}`);
      setCreating(false);
      setEditing(false);
      setSelectedKey(body.tool?.key ?? form.key);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPending(false);
    }
  }

  async function deleteSelected() {
    if (!isOwner || !selected?.workspaceOwned) return;
    if (!window.confirm(`Delete tool ${selected.key}?`)) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/tools?key=${encodeURIComponent(selected.key)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Delete failed");
      setOk(`Deleted ${selected.key}`);
      setEditing(false);
      setSelectedKey(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  async function toggleMcp(provider: string, enabled: boolean) {
    if (!isOwner) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/mcp`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Update failed");
      setMcp((rows) =>
        rows.map((r) => (r.provider === provider ? { ...r, enabled } : r)),
      );
      setOk(`${provider} ${enabled ? "enabled" : "disabled"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  async function deleteMcp(provider: string) {
    if (!isOwner) return;
    if (!window.confirm(`Remove MCP connection ${provider}?`)) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/mcp?provider=${encodeURIComponent(provider)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Delete failed");
      setMcp((rows) => rows.filter((r) => r.provider !== provider));
      setOk(`Removed ${provider}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPending(false);
    }
  }

  const showEditor = isOwner && (creating || editing);
  const kindFilters: KindFilter[] = ["all", "core", "mcp", "alias", "custom"];

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Tools</h1>
          <div className={styles.headActions}>
            {isOwner ? (
              <button
                type="button"
                className={styles.newBtn}
                onClick={startCreate}
                disabled={pending}
              >
                New tool
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
                href={`/workspaces/${workspaceId}/skills`}
                className={styles.headLink}
              >
                Skills
              </Link>
              {isOwner ? (
                <>
                  <span className={styles.headSep} aria-hidden>
                    ·
                  </span>
                  <Link
                    href={`/workspaces/${workspaceId}/settings?tab=llm`}
                    className={styles.headLink}
                  >
                    MCP
                  </Link>
                </>
              ) : null}
            </nav>
          </div>
        </div>
        <p className={styles.lede}>
          Capability tokens on agent allowlists — core, MCP, and workspace
          entries. Custom tokens are policy metadata; harness execution stays
          core + MCP.
        </p>
        <div className={styles.summaryStrip} aria-label="Tools summary">
          <span className={styles.summaryItem}>
            <strong>{tools.length}</strong> tools
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{coreCount}</strong> core
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{mcpCount}</strong> MCP
          </span>
          <span className={styles.summaryDot} aria-hidden>
            ·
          </span>
          <span className={styles.summaryItem}>
            <strong>{customCount}</strong> workspace
          </span>
        </div>
      </header>

      {error ? <p className={styles.error}>{error}</p> : null}
      {ok ? <p className={styles.ok}>{ok}</p> : null}

      <div
        className={`${styles.layout} ${selected || creating ? styles.layoutDetailOpen : ""}`}
      >
        <aside className={styles.listPane} aria-label="Tool catalog">
          <input
            type="search"
            className={styles.filter}
            placeholder="Filter tools…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter tools"
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
          {filteredTools.length === 0 ? (
            <p className={styles.emptyList}>
              No tools match
              {query.trim() ? ` “${query.trim()}”` : " this filter"}.
            </p>
          ) : (
            <ul className={styles.itemList}>
              {filteredTools.map((t) => {
                const active = !creating && t.key === selectedKey;
                return (
                  <li key={t.key}>
                    <button
                      type="button"
                      className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                      aria-current={active ? "true" : undefined}
                      onClick={() => selectTool(t.key)}
                    >
                      <p className={styles.itemName}>{t.title}</p>
                      <p className={styles.itemAside}>
                        {t.agents.length > 0
                          ? `${t.agents.length} agent${t.agents.length === 1 ? "" : "s"}`
                          : "—"}
                      </p>
                      <p className={styles.itemKey}>{t.key}</p>
                      <p className={styles.itemMeta}>
                        <span>{t.kind}</span>
                        {t.workspaceOwned ? (
                          <>
                            <span className={styles.metaSep} aria-hidden>
                              ·
                            </span>
                            <span>workspace</span>
                          </>
                        ) : null}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <section className={styles.mcpPanel} aria-label="MCP connections">
            <div className={styles.sectionHead}>
              <h3 className={styles.sectionLabel}>MCP connections</h3>
              <span className={styles.sectionCount}>
                {mcpConnections.length}
              </span>
            </div>
            {mcpConnections.length === 0 ? (
              <p className={styles.note}>
                None connected.{" "}
                {isOwner ? (
                  <Link
                    href={`/workspaces/${workspaceId}/settings?tab=llm`}
                    className={styles.footerLink}
                  >
                    Configure in Settings
                  </Link>
                ) : null}
              </p>
            ) : (
              <ul className={styles.relatedList}>
                {mcpConnections.map((c) => (
                  <li key={c.provider} className={styles.mcpRow}>
                    <div>
                      <p className={styles.relatedTitle}>{c.displayName}</p>
                      <p className={styles.relatedMeta}>
                        {c.provider}{" "}
                        <span
                          className={`${styles.statusPill} ${c.enabled ? styles.statusOn : styles.statusOff}`}
                        >
                          {c.enabled ? "on" : "off"}
                        </span>
                      </p>
                    </div>
                    {isOwner ? (
                      <div className={styles.btnRow}>
                        <button
                          type="button"
                          className={styles.btnGhost}
                          disabled={pending}
                          onClick={() =>
                            void toggleMcp(c.provider, !c.enabled)
                          }
                        >
                          {c.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className={styles.btnDanger}
                          disabled={pending}
                          onClick={() => void deleteMcp(c.provider)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        <section className={styles.detailPane} aria-live="polite">
          {showEditor ? (
            <div className={styles.editor}>
              <h2 className={styles.editorTitle}>
                {creating ? "New tool" : `Edit ${selected?.title}`}
              </h2>
              {creating ? (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="tool-key">
                    Key
                  </label>
                  <input
                    id="tool-key"
                    className={styles.input}
                    value={form.key}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, key: e.target.value }))
                    }
                    placeholder="my-tool"
                    disabled={pending}
                    autoComplete="off"
                  />
                </div>
              ) : null}
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="tool-title">
                  Title
                </label>
                <input
                  id="tool-title"
                  className={styles.input}
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="tool-desc">
                  Description
                </label>
                <textarea
                  id="tool-desc"
                  className={styles.textarea}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  disabled={pending}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="tool-kind">
                  Kind
                </label>
                <select
                  id="tool-kind"
                  className={styles.select}
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, kind: e.target.value }))
                  }
                  disabled={pending}
                >
                  <option value="custom">custom (catalog / policy)</option>
                  <option value="alias">alias → core</option>
                  <option value="mcp">mcp → connector</option>
                </select>
              </div>
              {form.kind !== "custom" ? (
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="tool-target">
                    Target token
                  </label>
                  <input
                    id="tool-target"
                    className={styles.input}
                    value={form.targetToken}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, targetToken: e.target.value }))
                    }
                    placeholder={
                      form.kind === "alias" ? "edit" : "mcp:sonarqube"
                    }
                    disabled={pending}
                  />
                </div>
              ) : (
                <p className={styles.honesty}>
                  Custom tools are allowlist membership + documentation only —
                  they do not unlock new harness capabilities.
                </p>
              )}
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
                {!creating && selected?.workspaceOwned ? (
                  <button
                    type="button"
                    className={styles.btnDanger}
                    disabled={pending}
                    onClick={() => void deleteSelected()}
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!creating && !selected ? (
            <div className={styles.emptyDetail}>
              <strong>Select a tool</strong>
              <p className={styles.note}>
                Pick a tool to see what it allows and which agents may use it.
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
                ← All tools
              </button>
              <div className={styles.detailHead}>
                <div className={styles.detailHeadMain}>
                  <h2 className={styles.detailTitle}>{selected.title}</h2>
                  <p className={styles.detailKey}>
                    {selected.key} · {sourceLabel(selected)}
                  </p>
                  <div className={styles.props}>
                    <div className={styles.prop}>
                      <span className={styles.propLabel}>Kind</span>
                      <span className={styles.propValue}>{selected.kind}</span>
                    </div>
                    <div className={styles.prop}>
                      <span className={styles.propLabel}>Agents</span>
                      <span className={styles.propValue}>
                        {selected.agents.length}
                      </span>
                    </div>
                    <div className={styles.prop}>
                      <span className={styles.propLabel}>Source</span>
                      <span className={styles.propValue}>
                        {sourceLabel(selected)}
                      </span>
                    </div>
                    {selected.targetToken ? (
                      <div className={styles.prop}>
                        <span className={styles.propLabel}>Target</span>
                        <span className={`${styles.propValue} ${styles.codeInline}`}>
                          {selected.targetToken}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                {isOwner && selected.workspaceOwned ? (
                  <div className={styles.btnRow}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      onClick={() => startEdit(selected)}
                      disabled={pending}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={pending}
                      onClick={() => void deleteSelected()}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </div>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>What it does</h3>
                <p className={styles.bodyBlock}>{selected.description}</p>
                {selected.kind === "custom" && selected.workspaceOwned ? (
                  <p className={styles.honesty} style={{ marginTop: "0.55rem" }}>
                    Catalog / policy token — no new harness capability.
                  </p>
                ) : null}
              </section>

              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionLabel}>Granted to agents</h3>
                  <span className={styles.sectionCount}>
                    {selected.agents.length}
                  </span>
                </div>
                {selected.agents.length === 0 ? (
                  <p className={styles.note}>
                    No profile currently grants this tool — attach from Agents →
                    Edit.
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
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
