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
  tools?: string[];
};

type AgentGrant = {
  key: string;
  displayName: string;
  tools: string[];
};

type Props = {
  workspaceId: string;
  workspaceName: string;
  isOwner: boolean;
  tools: ToolRow[];
  mcpConnections: McpRow[];
  allAgents?: AgentGrant[];
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
  allAgents: initialAgents = [],
  initialKey,
}: Props) {
  const router = useRouter();
  const [tools, setTools] = useState(initialTools);
  const [mcpConnections, setMcp] = useState(initialMcp);
  const [allAgents, setAllAgents] = useState(initialAgents);
  const [mcpProvider, setMcpProvider] = useState<"sonarqube" | "mcp">(
    "sonarqube",
  );
  const [mcpEndpoint, setMcpEndpoint] = useState("");
  const [mcpToken, setMcpToken] = useState("");
  const [mcpProjectKey, setMcpProjectKey] = useState("");
  const [mcpToolAllowlist, setMcpToolAllowlist] = useState(
    "search_docs, list_resources",
  );
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
    setAllAgents(initialAgents);
  }, [initialAgents]);

  async function connectMcp() {
    if (!isOwner) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const toolAllowlist =
        mcpProvider === "mcp"
          ? mcpToolAllowlist
              .split(/[,\s]+/)
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;
      const res = await fetch(`/api/workspaces/${workspaceId}/mcp`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: mcpProvider,
          displayName: mcpProvider === "sonarqube" ? "SonarQube" : "MCP server",
          endpointUrl: mcpEndpoint,
          token: mcpToken || undefined,
          projectKey: mcpProjectKey || undefined,
          toolAllowlist,
          enabled: true,
        }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Connect failed");
      setOk(`${mcpProvider} connected`);
      setMcpToken("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setPending(false);
    }
  }

  async function setToolOnAgent(
    agentKey: string,
    toolKey: string,
    attach: boolean,
  ) {
    if (!isOwner) return;
    const agent = allAgents.find((a) => a.key === agentKey);
    if (!agent) return;
    const next = attach
      ? [...new Set([...agent.tools, toolKey])]
      : agent.tools.filter((k) => k !== toolKey);
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/profiles`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: agentKey, toolAllowlist: next }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Update failed");
      setAllAgents((rows) =>
        rows.map((a) => (a.key === agentKey ? { ...a, tools: next } : a)),
      );
      setOk(
        attach
          ? `Granted ${toolKey} → ${agentKey}`
          : `Removed ${toolKey} from ${agentKey}`,
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
        t.description.toLowerCase().includes(q) ||
        (t.targetToken?.toLowerCase().includes(q) ?? false) ||
        t.agents.some(
          (a) =>
            a.key.toLowerCase().includes(q) ||
            a.displayName.toLowerCase().includes(q),
        )
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
                      <span className={styles.itemName}>{t.title}</span>
                      <span className={styles.itemAside}>
                        {t.agents.length > 0
                          ? `${t.agents.length} agent${t.agents.length === 1 ? "" : "s"}`
                          : "—"}
                      </span>
                      <span className={styles.itemKey}>{t.key}</span>
                      <span className={styles.itemMeta}>
                        {t.kind}
                        <span className={styles.metaSep} aria-hidden>
                          ·
                        </span>
                        {sourceLabel(t)}
                      </span>
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
                None connected — use the form below (Tools is the MCP home).
              </p>
            ) : (
              <ul className={styles.relatedList}>
                {mcpConnections.map((c) => (
                  <li key={c.provider} className={styles.mcpRow}>
                    <div>
                      <span className={styles.relatedTitle}>
                        {c.displayName}
                      </span>
                      <span className={styles.relatedMeta}>
                        {c.provider}{" "}
                        <span
                          className={`${styles.statusPill} ${c.enabled ? styles.statusOn : styles.statusOff}`}
                        >
                          {c.enabled ? "on" : "off"}
                        </span>
                        {c.tools?.length
                          ? ` · ${c.tools.join(", ")}`
                          : null}
                      </span>
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
            {isOwner ? (
              <div className={styles.field} style={{ marginTop: "0.75rem" }}>
                <label className={styles.fieldLabel} htmlFor="mcp-provider">
                  Connect MCP
                </label>
                <select
                  id="mcp-provider"
                  className={styles.select}
                  value={mcpProvider}
                  onChange={(e) =>
                    setMcpProvider(e.target.value as "sonarqube" | "mcp")
                  }
                  disabled={pending}
                >
                  <option value="sonarqube">SonarQube</option>
                  <option value="mcp">Generic HTTPS MCP</option>
                </select>
                <input
                  className={styles.input}
                  style={{ marginTop: "0.4rem" }}
                  value={mcpEndpoint}
                  onChange={(e) => setMcpEndpoint(e.target.value)}
                  placeholder={
                    mcpProvider === "sonarqube"
                      ? "https://sonar.example.com"
                      : "https://mcp.example.com/rpc"
                  }
                  disabled={pending}
                />
                <input
                  className={styles.input}
                  style={{ marginTop: "0.4rem" }}
                  type="password"
                  value={mcpToken}
                  onChange={(e) => setMcpToken(e.target.value)}
                  placeholder={
                    mcpProvider === "sonarqube"
                      ? "Token (required)"
                      : "Bearer token (optional)"
                  }
                  disabled={pending}
                />
                {mcpProvider === "sonarqube" ? (
                  <input
                    className={styles.input}
                    style={{ marginTop: "0.4rem" }}
                    value={mcpProjectKey}
                    onChange={(e) => setMcpProjectKey(e.target.value)}
                    placeholder="Project key (optional)"
                    disabled={pending}
                  />
                ) : (
                  <input
                    className={styles.input}
                    style={{ marginTop: "0.4rem" }}
                    value={mcpToolAllowlist}
                    onChange={(e) => setMcpToolAllowlist(e.target.value)}
                    placeholder="tool_a, tool_b"
                    disabled={pending}
                  />
                )}
                <button
                  type="button"
                  className={styles.btnPrimary}
                  style={{ marginTop: "0.5rem" }}
                  disabled={
                    pending ||
                    !mcpEndpoint ||
                    (mcpProvider === "sonarqube" && !mcpToken)
                  }
                  onClick={() => void connectMcp()}
                >
                  Connect
                </button>
              </div>
            ) : null}
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
                    {selected.key} · {selected.kind} · {sourceLabel(selected)}
                  </p>
                  <div className={styles.chipRow}>
                    <span className={styles.chip}>{selected.kind}</span>
                    <span className={styles.chip}>{sourceLabel(selected)}</span>
                    <span className={styles.chip}>
                      {selected.agents.length} agent
                      {selected.agents.length === 1 ? "" : "s"}
                    </span>
                    {selected.targetToken ? (
                      <span className={styles.chip}>{selected.targetToken}</span>
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
                  <h3 className={styles.sectionLabel}>Grant to agents</h3>
                  <span className={styles.sectionCount}>
                    {allAgents.filter((a) => a.tools.includes(selected.key))
                      .length}
                  </span>
                </div>
                {selected.kind === "custom" ? (
                  <p className={styles.honesty}>
                    Custom tokens are catalog / policy only — granting them does
                    not unlock new harness capabilities.
                  </p>
                ) : null}
                {allAgents.length === 0 ? (
                  <p className={styles.note}>No agents in this workspace.</p>
                ) : (
                  <div className={styles.checkGrid}>
                    {allAgents.map((a) => {
                      const on = a.tools.includes(selected.key);
                      return (
                        <label key={a.key} className={styles.checkItem}>
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!isOwner || pending}
                            onChange={(e) =>
                              void setToolOnAgent(
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
