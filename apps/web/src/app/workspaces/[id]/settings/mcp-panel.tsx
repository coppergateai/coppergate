"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

type Conn = {
  id: string;
  provider: string;
  displayName: string;
  endpointUrl: string;
  enabled: boolean;
  tools: string[];
  hasCredentials: boolean;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
};

export function McpPanel({ workspaceId, isOwner }: Props) {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [endpointUrl, setEndpointUrl] = useState("");
  const [token, setToken] = useState("");
  const [projectKey, setProjectKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/mcp`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as {
      connections?: Conn[];
      error?: { message: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? "Load failed");
    setConnections(body.connections ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void load().catch((err: unknown) =>
      setError(err instanceof Error ? err.message : "Load failed"),
    );
  }, [load]);

  async function connect() {
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/mcp`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "sonarqube",
          displayName: "SonarQube",
          endpointUrl,
          token,
          projectKey: projectKey || undefined,
          enabled: true,
        }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Connect failed");
      setOk("SonarQube connected");
      setToken("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setPending(false);
    }
  }

  async function toggle(provider: string, enabled: boolean) {
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="mcp-heading">
      <h2 id="mcp-heading" className={styles.sectionLabel}>
        MCP / SonarQube
      </h2>
      <p className={styles.sectionLede}>
        Connect SonarQube so fixer/security agents can call read-only quality
        tools (issues, gate, hotspots). Fail-closed against profile tool
        allowlists.
      </p>

      {connections.length ? (
        <ul className={styles.list}>
          {connections.map((c) => (
            <li key={c.id} className={styles.row}>
              <div>
                <p className={styles.rowTitle}>{c.displayName}</p>
                <p className={styles.rowMeta}>
                  {c.provider} · {c.endpointUrl} ·{" "}
                  {c.enabled ? "enabled" : "disabled"} · tools{" "}
                  {c.tools.join(", ")}
                </p>
              </div>
              {isOwner ? (
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={pending}
                  onClick={() => void toggle(c.provider, !c.enabled)}
                >
                  {c.enabled ? "Disable" : "Enable"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No MCP connections yet.</p>
      )}

      {isOwner ? (
        <div className={styles.rowActions} style={{ marginTop: "0.75rem" }}>
          <label className={styles.rowMeta}>
            Server URL
            <input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              placeholder="https://sonar.example.com"
              style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
            />
          </label>
          <label className={styles.rowMeta}>
            Token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
            />
          </label>
          <label className={styles.rowMeta}>
            Project key (optional)
            <input
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
            />
          </label>
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={pending || !endpointUrl || !token}
            onClick={() => void connect()}
          >
            {pending ? "Saving…" : "Connect SonarQube"}
          </button>
        </div>
      ) : null}

      {ok ? <p className={styles.note}>{ok}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
