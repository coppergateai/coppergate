"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./projects.module.css";

type Props = {
  workspaceId: string;
  repositories: Array<{ id: string; fullName: string }>;
};

export function CreateProjectForm({ workspaceId, repositories }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"new_product" | "existing_repo">(
    "existing_repo",
  );
  const [repositoryConnectionId, setRepositoryConnectionId] = useState(
    repositories[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <form
      className={styles.panel}
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
              error?: { message: string };
            };
            if (!res.ok) {
              throw new Error(body.error?.message ?? "Create failed");
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
        Stack is fixed to <code>nextjs_ts</code> for MVP. Each repo can bind to
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
    </form>
  );
}
