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

type SelectableProject = {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
};

type Props = {
  workspaceId: string;
  canManage: boolean;
  initialQuery?: string;
  /** Hide outer section chrome when nested in ScmConnectionsPanel. */
  embedded?: boolean;
};

export function GitlabPanel({
  workspaceId,
  canManage,
  initialQuery,
  embedded = false,
}: Props) {
  const [installation, setInstallation] = useState<Installation>(null);
  const [connected, setConnected] = useState<ConnectedRepo[]>([]);
  const [selectable, setSelectable] = useState<SelectableProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/gitlab`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as {
      installation: Installation;
      repositories: ConnectedRepo[];
      error?: { message: string };
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? "Failed to load GitLab status");
    }
    setInstallation(body.installation);
    setConnected(body.repositories);
  }, [workspaceId]);

  const loadSelectable = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/gitlab/projects`, {
      credentials: "same-origin",
    });
    const body = (await res.json()) as {
      projects?: SelectableProject[];
      error?: { message: string };
    };
    if (!res.ok) {
      throw new Error(body.error?.message ?? "Failed to list projects");
    }
    setSelectable(body.projects ?? []);
  }, [workspaceId]);

  useEffect(() => {
    if (initialQuery?.includes("gitlab=connected")) {
      setMessage("GitLab connected.");
    }
    void refresh().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Load failed");
    });
  }, [refresh, initialQuery]);

  useEffect(() => {
    if (installation?.status === "active") {
      void loadSelectable().catch(() => {
        /* optional — token may need reconnect */
      });
    }
  }, [installation, loadSelectable]);

  const connectedIds = new Set(
    connected.map((c) => c.fullName.toLowerCase()),
  );

  const body = (
      <div className={styles.panel}>
        {message ? <p className={styles.ok}>{message}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {installation ? (
          <p className={styles.status}>
            Connected as <strong>@{installation.accountLogin}</strong> (
            {installation.status})
          </p>
        ) : (
          <p className={styles.statusMuted}>
            Connect GitLab to deliver merge requests from arenas.
          </p>
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
                void fetch("/api/integrations/gitlab/install", {
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
                      throw new Error(body.error?.message ?? "Connect failed");
                    }
                    window.location.href = body.url;
                  })
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error ? err.message : "Connect failed",
                    );
                    setBusy(false);
                  });
              }}
            >
              {installation ? "Reconnect GitLab" : "Connect GitLab"}
            </button>
            {installation ? (
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void fetch(`/api/workspaces/${workspaceId}/gitlab`, {
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
                      setMessage("GitLab credentials revoked for this workspace.");
                    })
                    .catch((err: unknown) => {
                      setError(
                        err instanceof Error ? err.message : "Revoke failed",
                      );
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Revoke GitLab
              </button>
            ) : null}
          </div>
        ) : null}

        {connected.length > 0 ? (
          <div className={styles.subBlock}>
            <h3 className={styles.subTitle}>Connected projects</h3>
            <ul className={styles.list}>
              {connected.map((repo) => (
                <li key={repo.id} className={styles.row}>
                  <span>
                    {repo.fullName}
                    <span className={styles.repoMeta}>{repo.defaultBranch}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {canManage && selectable.length > 0 ? (
          <div className={styles.subBlock}>
            <h3 className={styles.subTitle}>Available projects</h3>
            <ul className={styles.list}>
              {selectable.map((project) => {
                const already = connectedIds.has(project.fullName.toLowerCase());
                return (
                  <li key={project.id} className={styles.row}>
                    <span>{project.fullName}</span>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      disabled={already || busy}
                      onClick={() => {
                        setBusy(true);
                        void fetch(
                          `/api/workspaces/${workspaceId}/gitlab/projects`,
                          {
                            method: "POST",
                            credentials: "same-origin",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              projectId: project.id,
                              fullName: project.fullName,
                              owner: project.owner,
                              name: project.name,
                              defaultBranch: project.defaultBranch,
                            }),
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
  );

  if (embedded) return body;

  return (
    <section className={styles.section} aria-labelledby="gitlab-heading">
      <h2 id="gitlab-heading" className={styles.sectionLabel}>
        GitLab credentials
      </h2>
      <p className={styles.sectionLede}>
        Connect GitLab (gitlab.com or self-managed via{" "}
        <code>GITLAB_BASE_URL</code>), select a project, and deliver Merge
        Requests. One primary SCM per workspace.
      </p>
      {body}
    </section>
  );
}
