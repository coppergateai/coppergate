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
  const [pending, setPending] = useState(false);

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
        Import an open issue as a draft task. The PR will include Closes #N.
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
                <button
                  type="button"
                  className={styles.ghostBtn}
                  disabled={pending}
                  onClick={() => {
                    setPending(true);
                    void fetch(`/api/projects/${projectId}/issues`, {
                      method: "POST",
                      credentials: "same-origin",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        workspaceId,
                        issueNumber: issue.number,
                      }),
                    })
                      .then(async (res) => {
                        const body = (await res.json()) as {
                          error?: { message?: string };
                        };
                        if (!res.ok) {
                          throw new Error(body.error?.message ?? "Import failed");
                        }
                        router.refresh();
                      })
                      .catch((err: unknown) =>
                        setError(
                          err instanceof Error ? err.message : String(err),
                        ),
                      )
                      .finally(() => setPending(false));
                  }}
                >
                  Import
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
