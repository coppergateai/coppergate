"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type Issue = {
  number: number;
  title: string;
  htmlUrl: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  isOwner: boolean;
};

export function IssuesPanel({ workspaceId, projectId, isOwner }: Props) {
  const router = useRouter();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [repo, setRepo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/issues?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    const data = (await res.json()) as {
      issues?: Issue[];
      repo?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(data.error?.message ?? "Failed to load issues");
      return;
    }
    setIssues(data.issues ?? []);
    setRepo(data.repo ?? null);
    setError(null);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function importIssue(
    issueNumber: number,
    mode: "draft" | "queue",
  ): Promise<void> {
    setPending(issueNumber);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/issues`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          issueNumber,
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
      id="issues"
      className={styles.section}
      aria-labelledby="issues-heading"
    >
      <h2 id="issues-heading" className={styles.sectionLabel}>
        GitHub issues → tasks
      </h2>
      <p className={styles.sectionLede}>
        Primary pilot path: import an open issue, approve/queue, review the PR
        with CI evidence and cost, then Accept in-product. The PR includes
        Closes #N.
        {repo ? ` · ${repo}` : null}
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <ul className={styles.arenaList}>
        {issues.length === 0 ? (
          <li className={styles.muted}>No open issues (or GitHub not connected).</li>
        ) : (
          issues.map((issue) => (
            <li key={issue.number} className={styles.arenaItem}>
              <strong>
                #{issue.number} {issue.title}
              </strong>
              {isOwner ? (
                <span style={{ display: "inline-flex", gap: "0.35rem" }}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending != null}
                    onClick={() => void importIssue(issue.number, "draft")}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pending != null}
                    onClick={() => void importIssue(issue.number, "queue")}
                  >
                    {pending === issue.number
                      ? "Working…"
                      : "Import → queue"}
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
