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

  const selected = useMemo(
    () => tools.find((t) => t.key === selectedKey) ?? null,
    [tools, selectedKey],
  );

  const coreCount = tools.filter((t) => t.kind === "core").length;
  const mcpCount = tools.filter((t) => t.kind === "mcp").length;
  const customCount = tools.filter((t) => t.workspaceOwned).length;

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

  return (
    <main className={styles.main}>
      <header className={styles.head}>
        <p className={styles.eyebrow}>Workspace / {workspaceName}</p>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Tools</h1>
          <div className={styles.headLinks}>
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
                MCP setup →
              </Link>
            ) : null}
          </div>
        </div>
        <p className={styles.lede}>
          Capability tokens on agent allowlists — core, MCP, and workspace
          catalog entries. Custom tokens are policy metadata; harness execution
          stays core + MCP.
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
          <span>
            <strong>{customCount}</strong> workspace
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
        <aside className={styles.listPane} aria-label="Tool catalog">
          <ul className={styles.itemList}>
            {tools.map((t) => {
              const active = !creating && t.key === selectedKey;
              return (
                <li key={t.key}>
                  <button
                    type="button"
                    className={`${styles.itemBtn} ${active ? styles.itemBtnActive : ""}`}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setSelectedKey(t.key);
                      setCreating(false);
                      setEditing(false);
                    }}
                  >
                    <p className={styles.itemName}>{t.title}</p>
                    <p className={styles.itemKey}>{t.key}</p>
                    <p className={styles.itemMeta}>
                      <span>{t.kind}</span>
                      <span>
                        {t.agents.length} agent
                        {t.agents.length === 1 ? "" : "s"}
                      </span>
                      {t.workspaceOwned ? <span>workspace</span> : null}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>

          <section className={styles.section} style={{ marginTop: "1.25rem", padding: "0 0.4rem" }}>
            <h3 className={styles.sectionLabel}>MCP connections</h3>
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
                  <li key={c.provider} className={styles.relatedItem}>
                    <div>
                      <p className={styles.relatedTitle}>{c.displayName}</p>
                      <p className={styles.relatedMeta}>
                        {c.provider} · {c.enabled ? "on" : "off"}
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
              <h2 className={styles.detailTitle}>
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
                <h2 className={styles.detailTitle}>{selected.title}</h2>
                <p className={styles.detailKey}>{selected.key}</p>
                <div className={styles.chipRow}>
                  <span className={styles.chip}>{selected.kind}</span>
                  <span className={styles.chip}>
                    {selected.agents.length} agent
                    {selected.agents.length === 1 ? "" : "s"}
                  </span>
                  {selected.workspaceOwned ? (
                    <span className={styles.chip}>workspace</span>
                  ) : (
                    <span className={styles.chip}>system</span>
                  )}
                </div>
              </div>

              {isOwner && selected.workspaceOwned ? (
                <div className={styles.btnRow} style={{ marginBottom: "1rem" }}>
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

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>What it does</h3>
                <p className={styles.bodyBlock}>{selected.description}</p>
                {selected.kind === "custom" && selected.workspaceOwned ? (
                  <p className={styles.honesty} style={{ marginTop: "0.5rem" }}>
                    Catalog / policy token — no new harness capability.
                  </p>
                ) : null}
                {selected.targetToken ? (
                  <p className={styles.note}>
                    Target: <code>{selected.targetToken}</code>
                  </p>
                ) : null}
              </section>

              <section className={styles.section}>
                <h3 className={styles.sectionLabel}>Granted to agents</h3>
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
