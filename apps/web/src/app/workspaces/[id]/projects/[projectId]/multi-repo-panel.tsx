"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./project-detail.module.css";

type RepoRow = {
  id: string;
  fullName: string;
  role: string;
  status: string;
};

type UnboundRow = { id: string; fullName: string };

type Policy = {
  enabled: boolean;
  maxSecondaryRepos: number;
  maxSecondaryFiles: number;
  coordinatedPrs: boolean;
};

type Props = {
  workspaceId: string;
  projectId: string;
  isOwner: boolean;
};

export function MultiRepoPanel({ workspaceId, projectId, isOwner }: Props) {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [repos, setRepos] = useState<RepoRow[]>([]);
  const [unbound, setUnbound] = useState<UnboundRow[]>([]);
  const [attachId, setAttachId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/repos?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const data = (await res.json()) as {
      policy?: Policy;
      repos?: RepoRow[];
      unbound?: UnboundRow[];
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load repos");
      setLoading(false);
      return;
    }
    setPolicy(data.policy ?? null);
    setRepos(data.repos ?? []);
    setUnbound(data.unbound ?? []);
    setError(null);
    setLoading(false);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(
    path: string,
    method: string,
    body?: Record<string, unknown>,
  ) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      const data = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(data.error?.message ?? "Request failed");
        return;
      }
      await load();
    } finally {
      setPending(false);
    }
  }

  const secondaries = repos.filter((r) => r.role === "secondary");
  const primary = repos.find((r) => r.role === "primary");

  return (
    <section
      id="repos"
      className={styles.section}
      aria-labelledby="repos-heading"
    >
      <h2 id="repos-heading" className={styles.sectionLabel}>
        Repositories
      </h2>
      <p className={styles.sectionLede}>
        One primary write repo per project. Secondary repos are context for this
        arena when multi-repo is enabled (capped — not a full org merge); writes
        stay on primary unless coordinated PRs are on. Agents do not chat across
        repos.
      </p>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading || !policy ? (
        <p className={styles.muted}>Loading…</p>
      ) : (
        <div className={styles.panel}>
          <div className={styles.metaRow}>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={policy.enabled}
                disabled={!isOwner || pending}
                onChange={(e) =>
                  void mutate(`/api/projects/${projectId}/repos`, "PATCH", {
                    enabled: e.target.checked,
                  })
                }
              />
              Multi-repo enabled
            </label>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={policy.coordinatedPrs}
                disabled={!isOwner || pending || !policy.enabled}
                onChange={(e) =>
                  void mutate(`/api/projects/${projectId}/repos`, "PATCH", {
                    coordinatedPrs: e.target.checked,
                  })
                }
              />
              Coordinated PRs
            </label>
            <span>
              max secondary {policy.maxSecondaryRepos} · file cap{" "}
              {policy.maxSecondaryFiles}
            </span>
          </div>

          <p className={styles.arenaBoardKicker}>Bound</p>
          <ul className={styles.arenaList}>
            {repos.map((r) => (
              <li key={r.id} className={styles.arenaItem}>
                <div className={styles.arenaItemTop}>
                  <strong>{r.fullName}</strong>
                  <span className={styles.arenaItemStatus}>{r.role}</span>
                </div>
                <div className={styles.arenaItemMeta}>
                  <span>{r.status}</span>
                  {isOwner && r.role === "secondary" ? (
                    <span className={styles.btnRow}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={pending}
                        onClick={() =>
                          void mutate(
                            `/api/projects/${projectId}/repos/promote`,
                            "POST",
                            { repositoryConnectionId: r.id },
                          )
                        }
                      >
                        Make primary
                      </button>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={pending}
                        onClick={() =>
                          void mutate(
                            `/api/projects/${projectId}/repos/detach`,
                            "POST",
                            { repositoryConnectionId: r.id },
                          )
                        }
                      >
                        Detach
                      </button>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {!primary ? (
            <p className={styles.muted}>No primary repo bound.</p>
          ) : null}
          {policy.enabled && secondaries.length === 0 ? (
            <p className={styles.muted}>
              No secondary repos attached yet.
            </p>
          ) : null}

          {isOwner && policy.enabled ? (
            <div className={styles.btnRow}>
              <label className={styles.field}>
                Attach unbound repo
                <select
                  className={styles.inputNarrow}
                  value={attachId}
                  onChange={(e) => setAttachId(e.target.value)}
                  disabled={pending || unbound.length === 0}
                >
                  <option value="">
                    {unbound.length === 0
                      ? "No unbound repos"
                      : "Select repo…"}
                  </option>
                  {unbound.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={pending || !attachId}
                onClick={() => {
                  const id = attachId;
                  setAttachId("");
                  void mutate(
                    `/api/projects/${projectId}/repos/attach`,
                    "POST",
                    { repositoryConnectionId: id },
                  );
                }}
              >
                Attach secondary
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
