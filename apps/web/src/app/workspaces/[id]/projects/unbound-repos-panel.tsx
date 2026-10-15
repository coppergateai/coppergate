"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bindRepository } from "./bind-repo";
import styles from "./projects.module.css";

export type UnboundRepo = {
  id: string;
  fullName: string;
  defaultBranch: string;
};

type Props = {
  workspaceId: string;
  repositories: UnboundRepo[];
  canManage: boolean;
};

export function UnboundReposPanel({
  workspaceId,
  repositories,
  canManage,
}: Props) {
  const router = useRouter();
  const [bindingId, setBindingId] = useState<string | null>(null);
  const [bindingAll, setBindingAll] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (repositories.length === 0) return null;

  const busy = bindingId !== null || bindingAll;

  async function bindOne(repo: UnboundRepo, opts?: { stay?: boolean }) {
    setError(null);
    setBindingId(repo.id);
    try {
      const result = await bindRepository({
        workspaceId,
        repositoryConnectionId: repo.id,
        fullName: repo.fullName,
      });
      if (!opts?.stay) {
        router.push(`/workspaces/${workspaceId}/projects/${result.projectId}`);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Bind failed");
      throw err;
    } finally {
      setBindingId(null);
    }
  }

  async function bindAll() {
    setBindingAll(true);
    setError(null);
    let done = 0;
    try {
      for (const repo of repositories) {
        done += 1;
        setProgress(`Binding ${done}/${repositories.length}: ${repo.fullName}`);
        setBindingId(repo.id);
        await bindRepository({
          workspaceId,
          repositoryConnectionId: repo.id,
          fullName: repo.fullName,
        });
      }
      setProgress(null);
      router.refresh();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `${err.message} (${done - 1}/${repositories.length} bound)`
          : "Bind all failed",
      );
      setProgress(null);
      router.refresh();
    } finally {
      setBindingId(null);
      setBindingAll(false);
    }
  }

  return (
    <section className={styles.unbound} aria-labelledby="unbound-heading">
      <div className={styles.unboundHead}>
        <div className={styles.unboundHeadText}>
          <h2 id="unbound-heading" className={styles.unboundTitle}>
            Available repositories
            <span className={styles.unboundCount}>{repositories.length}</span>
          </h2>
          <p className={styles.unboundLede}>
            Connected via SCM but not yet a Coppergate project. Binding detects
            the stack and creates a project named after the repo.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            className={styles.bindAllBtn}
            disabled={busy}
            onClick={() => {
              void bindAll();
            }}
          >
            {bindingAll ? "Binding all…" : `Bind all (${repositories.length})`}
          </button>
        ) : null}
      </div>

      {progress ? <p className={styles.unboundProgress}>{progress}</p> : null}
      {error ? (
        <p className={styles.unboundError} role="alert">
          {error}
        </p>
      ) : null}

      <ul className={styles.unboundList}>
        {repositories.map((repo) => {
          const [owner, ...rest] = repo.fullName.split("/");
          const name = rest.join("/") || repo.fullName;
          const pending = bindingId === repo.id;
          return (
            <li key={repo.id} className={styles.unboundItem}>
              <div className={styles.unboundRepo}>
                <span className={styles.unboundOwner}>{owner}/</span>
                <span className={styles.unboundName}>{name}</span>
                <span className={styles.unboundBranch}>
                  {repo.defaultBranch}
                </span>
              </div>
              {canManage ? (
                <button
                  type="button"
                  className={styles.unboundBind}
                  disabled={busy}
                  onClick={() => {
                    void bindOne(repo).catch(() => {
                      /* error already set */
                    });
                  }}
                >
                  {pending ? "Binding…" : "Bind"}
                </button>
              ) : (
                <span className={styles.unboundOwner}>Owner only</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
