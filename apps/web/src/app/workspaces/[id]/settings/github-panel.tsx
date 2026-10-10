"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";

type Installation = {
  id: string;
  accountLogin: string;
  status: string;
} | null;

type ConnectedRepo = {
  id: string;
  fullName: string;
  defaultBranch: string;
  status: string;
};

type SelectableRepo = {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
};

type Props = {
  workspaceId: string;
  canManage: boolean;
  initialQuery?: string;
};

export function GithubPanel({ workspaceId, canManage, initialQuery }: Props) {
  const [installation, setInstallation] = useState<Installation>(null);
  const [connected, setConnected] = useState<ConnectedRepo[]>([]);
  const [selectable, setSelectable] = useState<SelectableRepo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/github`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as {
      installation: Installation;
      repositories: ConnectedRepo[];
      error?: { message: string };
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? "Failed to load GitHub status");
    }
    setInstallation(body.installation);
    setConnected(body.repositories);
  }, [workspaceId]);

  const loadSelectable = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/github/repos`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as {
      repositories?: SelectableRepo[];
      error?: { message: string };
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? "Failed to list repos");
    }
    setSelectable(body.repositories ?? []);
  }, [workspaceId]);

  useEffect(() => {
    if (initialQuery?.includes("github=connected")) {
      setMessage("GitHub App connected.");
    } else if (initialQuery?.includes("github=pending")) {
      setMessage("GitHub install request pending organization approval.");
    }
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Load failed");
    });
  }, [refresh, initialQuery]);

  useEffect(() => {
    if (installation?.status === "active") {
      void loadSelectable().catch(() => {
        /* optional — App may be misconfigured in local dev */
      });
    }
  }, [installation, loadSelectable]);

  const connectedIds = new Set(
    connected.map((c) => c.fullName.toLowerCase()),
  );

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        GitHub
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#A3A3A3", fontSize: "0.875rem" }}>
        Connect the Coppergate GitHub App and select repositories. Writes
        (commits/PRs) stay disabled until a later phase.
      </p>

      {message ? (
        <p style={{ color: "#86EFAC", fontSize: "0.875rem" }}>{message}</p>
      ) : null}
      {error ? (
        <p style={{ color: "#F87171", fontSize: "0.875rem" }}>{error}</p>
      ) : null}

      {installation ? (
        <p style={{ color: "#E5E5E5", marginBottom: "1rem" }}>
          Installed on <strong>@{installation.accountLogin}</strong> ({installation.status})
        </p>
      ) : (
        <p style={{ color: "#737373", marginBottom: "1rem" }}>
          No GitHub App installation yet.
        </p>
      )}

      {canManage ? (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void fetch("/api/integrations/github/install", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workspaceId }),
              })
                .then(async (res) => {
                  const body = (await res.json()) as {
                    url?: string;
                    error?: { message: string };
                  };
                  if (!res.ok || !body.url) {
                    throw new Error(body.error?.message ?? "Install failed");
                  }
                  window.location.href = body.url;
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : "Install failed");
                  setBusy(false);
                });
            }}
            style={primaryBtn}
          >
            {installation ? "Reconfigure on GitHub" : "Install GitHub App"}
          </button>
          {installation ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void fetch(`/api/workspaces/${workspaceId}/github`, {
                  method: "DELETE",
                  credentials: "same-origin",
                })
                  .then(async (res) => {
                    if (!res.ok) {
                      const body = (await res.json()) as {
                        error?: { message: string };
                      };
                      throw new Error(body.error?.message ?? "Disconnect failed");
                    }
                    setSelectable([]);
                    await refresh();
                    setMessage("GitHub disconnected for this workspace.");
                  })
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error ? err.message : "Disconnect failed",
                    );
                  })
                  .finally(() => setBusy(false));
              }}
              style={ghostBtn}
            >
              Disconnect
            </button>
          ) : null}
        </div>
      ) : null}

      {connected.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>Connected repos</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
            {connected.map((repo) => (
              <li
                key={repo.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.65rem 0",
                  borderBottom: "1px solid #262626",
                }}
              >
                <span>
                  {repo.fullName}
                  <span style={{ color: "#737373", marginLeft: 8 }}>
                    {repo.defaultBranch}
                  </span>
                </span>
                {canManage ? (
                  <button
                    type="button"
                    style={linkBtn}
                    onClick={() => {
                      void fetch(
                        `/api/workspaces/${workspaceId}/github/repos/${repo.id}`,
                        { method: "DELETE", credentials: "same-origin" },
                      )
                        .then(async (res) => {
                          if (!res.ok) {
                            const body = (await res.json()) as {
                              error?: { message: string };
                            };
                            throw new Error(
                              body.error?.message ?? "Revoke failed",
                            );
                          }
                          await refresh();
                        })
                        .catch((err: unknown) => {
                          setError(
                            err instanceof Error ? err.message : "Revoke failed",
                          );
                        });
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canManage && selectable.length > 0 ? (
        <div style={{ marginTop: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600 }}>
            Available on installation
          </h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0 0" }}>
            {selectable.map((repo) => {
              const already = connectedIds.has(repo.fullName.toLowerCase());
              return (
                <li
                  key={repo.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "1rem",
                    padding: "0.65rem 0",
                    borderBottom: "1px solid #262626",
                  }}
                >
                  <span>
                    {repo.fullName}
                    {repo.private ? (
                      <span style={{ color: "#737373", marginLeft: 8 }}>private</span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    disabled={already || busy}
                    style={linkBtn}
                    onClick={() => {
                      setBusy(true);
                      void fetch(`/api/workspaces/${workspaceId}/github/repos`, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ githubRepoId: repo.id }),
                      })
                        .then(async (res) => {
                          if (!res.ok) {
                            const body = (await res.json()) as {
                              error?: { message: string };
                            };
                            throw new Error(
                              body.error?.message ?? "Connect failed",
                            );
                          }
                          await refresh();
                        })
                        .catch((err: unknown) => {
                          setError(
                            err instanceof Error ? err.message : "Connect failed",
                          );
                        })
                        .finally(() => setBusy(false));
                    }}
                  >
                    {already ? "Connected" : "Connect"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const primaryBtn: CSSProperties = {
  padding: "0.65rem 1rem",
  background: "#FFFFFF",
  color: "#0A0A0A",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};

const ghostBtn: CSSProperties = {
  padding: "0.65rem 1rem",
  background: "transparent",
  color: "#FFFFFF",
  border: "1px solid #404040",
  borderRadius: 4,
  cursor: "pointer",
};

const linkBtn: CSSProperties = {
  background: "none",
  border: "none",
  color: "#A3A3A3",
  cursor: "pointer",
  fontSize: "0.875rem",
  padding: 0,
};
