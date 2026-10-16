"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./settings.module.css";

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
    <section className={styles.section} aria-labelledby="github-heading">
      <h2 id="github-heading" className={styles.sectionLabel}>
        GitHub credentials
      </h2>
      <p className={styles.sectionLede}>
        Connect the Coppergate GitHub App, select repositories, and revoke
        access anytime. Disconnect purges sealed installation credentials for
        this workspace.
      </p>

      <div className={styles.panel}>
        {message ? <p className={styles.ok}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {installation ? (
          <p className={styles.status}>
            Installed on <strong>@{installation.accountLogin}</strong> (
            {installation.status})
          </p>
        ) : (
          <p className={styles.statusMuted}>No GitHub App installation yet.</p>
        )}

        {canManage ? (
          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.primaryBtn}
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                // Top-level form POST → 303 to GitHub (Set-Cookie on navigation).
                const form = document.createElement("form");
                form.method = "POST";
                form.action = "/api/integrations/github/install";
                form.style.display = "none";
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = "workspaceId";
                input.value = workspaceId;
                form.appendChild(input);
                document.body.appendChild(form);
                form.submit();
              }}
            >
              {installation ? "Reconfigure on GitHub" : "Install GitHub App"}
            </button>
            {installation ? (
              <button
                type="button"
                className={styles.ghostBtn}
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
                        throw new Error(
                          body.error?.message ?? "Disconnect failed",
                        );
                      }
                      setSelectable([]);
                      await refresh();
                      setMessage(
                        "GitHub credentials revoked for this workspace.",
                      );
                    })
                    .catch((err: unknown) => {
                      setError(
                        err instanceof Error ? err.message : "Revoke failed",
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Revoke installation
              </button>
            ) : null}
          </div>
        ) : null}

        {connected.length > 0 ? (
          <div className={styles.subBlock}>
            <h3 className={styles.subTitle}>Connected repos</h3>
            <ul className={styles.list}>
              {connected.map((repo) => (
                <li key={repo.id} className={styles.row}>
                  <span>
                    {repo.fullName}
                    <span className={styles.repoMeta}>{repo.defaultBranch}</span>
                  </span>
                  {canManage ? (
                    <button
                      type="button"
                      className={styles.linkBtn}
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
                              err instanceof Error
                                ? err.message
                                : "Revoke failed",
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
          <div className={styles.subBlock}>
            <h3 className={styles.subTitle}>Available on installation</h3>
            <ul className={styles.list}>
              {selectable.map((repo) => {
                const already = connectedIds.has(repo.fullName.toLowerCase());
                return (
                  <li key={repo.id} className={styles.row}>
                    <span>
                      {repo.fullName}
                      {repo.private ? (
                        <span className={styles.repoMeta}>private</span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      disabled={already || busy}
                      onClick={() => {
                        setBusy(true);
                        void fetch(
                          `/api/workspaces/${workspaceId}/github/repos`,
                          {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ githubRepoId: repo.id }),
                          },
                        )
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
                              err instanceof Error
                                ? err.message
                                : "Connect failed",
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
      </div>
    </section>
  );
}
