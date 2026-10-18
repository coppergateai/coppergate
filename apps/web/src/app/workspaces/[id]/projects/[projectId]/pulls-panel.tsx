"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type Pull = {
  number: number;
  title: string;
  htmlUrl: string;
  headRef?: string;
  baseRef?: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  isOwner: boolean;
};

export function PullsPanel({ workspaceId, projectId, isOwner }: Props) {
  const router = useRouter();
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/pulls?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const data = (await res.json()) as {
      pulls?: Pull[];
      repo?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load pull requests");
      return;
    }
    setPulls(data.pulls ?? []);
    setRepo(data.repo ?? null);
    setError(null);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function importPull(
    prNumber: number,
    mode: "draft" | "queue",
  ): Promise<void> {
    setPending(prNumber);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pulls`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          prNumber,
          queue: mode === "queue",
        }),
      });
      const body = (await res.json()) as {
        task?: { id: string; status: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(body.error?.message ?? "Import failed");
      }
      const taskId = body.task?.id;
      if (!taskId) throw new Error("Import succeeded but task id missing");
      router.push(
        `/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
      );
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      id="pulls"
      className={styles.section}
      aria-labelledby="pulls-heading"
    >
      <h2 id="pulls-heading" className={styles.sectionLabel}>
        Open PRs → review
      </h2>
      <p className={styles.sectionLede}>
        For existing repos: import an open pull request. Agents post a review
        comment on that PR (no new PR). Accept in Coppergate when done.
        {repo ? ` · ${repo}` : null}
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <ul className={styles.arenaList}>
        {pulls.length === 0 ? (
          <li className={styles.muted}>
            No open pull requests (or GitHub not connected).
          </li>
        ) : (
          pulls.map((pull) => (
            <li key={pull.number} className={styles.arenaItem}>
              <strong>
                #{pull.number} {pull.title}
              </strong>
              {pull.headRef && pull.baseRef ? (
                <span className={styles.muted}>
                  {" "}
                  {pull.headRef} → {pull.baseRef}
                </span>
              ) : null}
              {isOwner ? (
                <span style={{ display: "inline-flex", gap: "0.35rem" }}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending != null}
                    onClick={() => void importPull(pull.number, "draft")}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending != null}
                    onClick={() => void importPull(pull.number, "queue")}
                  >
                    {pending === pull.number ? "Working…" : "Import → queue"}
                  </button>
                </span>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
