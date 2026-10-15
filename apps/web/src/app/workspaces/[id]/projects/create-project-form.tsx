"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { projectNameFromRepo } from "./bind-repo";
import styles from "./projects.module.css";

type Props = {
  workspaceId: string;
  repositories: Array<{ id: string; fullName: string }>;
  compact?: boolean;
};

export function CreateProjectForm({
  workspaceId,
  repositories,
  compact = false,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bindId = searchParams.get("bind");
  const preferred =
    (bindId && repositories.find((r) => r.id === bindId)) || repositories[0];

  const [name, setName] = useState(() =>
    preferred ? projectNameFromRepo(preferred.fullName) : "",
  );
  const [mode, setMode] = useState<"new_product" | "existing_repo">(
    "existing_repo",
  );
  const [repositoryConnectionId, setRepositoryConnectionId] = useState(
    preferred?.id ?? "",
  );

  useEffect(() => {
    if (!bindId) return;
    const match = repositories.find((r) => r.id === bindId);
    if (!match) return;
    setRepositoryConnectionId(match.id);
    setName((current) =>
      current.trim() ? current : projectNameFromRepo(match.fullName),
    );
  }, [bindId, repositories]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className={compact ? styles.inlineForm : styles.panel}
      onSubmit={(e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        void fetch(`/api/workspaces/${workspaceId}/projects`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, mode, repositoryConnectionId }),
        })
          .then(async (res) => {
            const body = (await res.json()) as {
              project?: { id: string };
              error?: { message: string };
            };
            if (!res.ok) {
              throw new Error(body.error?.message ?? "Create failed");
            }
            const projectId = body.project?.id;
            if (projectId) {
              router.push(`/workspaces/${workspaceId}/projects/${projectId}`);
              router.refresh();
              return;
            }
            router.refresh();
            setName("");
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : "Create failed");
          })
          .finally(() => setPending(false));
      }}
    >
      {compact ? (
        <>
          <input
            required
            className={styles.inlineInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            aria-label="Project name"
          />
          <select
            className={styles.inlineSelect}
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "new_product" | "existing_repo")
            }
            aria-label="Mode"
          >
            <option value="existing_repo">Existing repo</option>
            <option value="new_product">New product</option>
          </select>
          <select
            required
            className={styles.inlineSelectWide}
            value={repositoryConnectionId}
            onChange={(e) => setRepositoryConnectionId(e.target.value)}
            aria-label="Repository"
          >
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className={styles.inlineSubmit}
            disabled={pending || !name.trim()}
          >
            {pending ? "…" : "Create"}
          </button>
          {error ? <p className={styles.inlineError}>{error}</p> : null}
        </>
      ) : (
        <>
          <label className={styles.field}>
            Name
            <input
              required
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-project"
            />
          </label>
          <label className={styles.field}>
            Mode
            <select
              className={styles.select}
              value={mode}
              onChange={(e) =>
                setMode(e.target.value as "new_product" | "existing_repo")
              }
            >
              <option value="existing_repo">Existing repo</option>
              <option value="new_product">New product (template)</option>
            </select>
          </label>
          <label className={styles.field}>
            Repository
            <select
              required
              className={styles.select}
              value={repositoryConnectionId}
              onChange={(e) => setRepositoryConnectionId(e.target.value)}
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.hint}>
            Stack is detected from the repository on bind. Each repo can bind to
            only one project.
          </p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button
            type="submit"
            className={styles.submit}
            disabled={pending || !name.trim()}
          >
            {pending ? "Creating…" : "Create project"}
          </button>
        </>
      )}
    </form>
  );
}
