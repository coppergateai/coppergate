"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { bindRepository } from "./bind-repo";
import styles from "./projects.module.css";

type Props = {
  workspaceId: string;
  repositoryConnectionId: string;
  fullName: string;
};

/** Compact bind control (kept for create-form adjacent use). */
export function BindRepoButton({
  workspaceId,
  repositoryConnectionId,
  fullName,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <span className={styles.bindCell}>
      <button
        type="button"
        className={styles.rowBind}
        disabled={pending}
        onClick={() => {
          setPending(true);
          setError(null);
          void bindRepository({
            workspaceId,
            repositoryConnectionId,
            fullName,
          })
            .then((result) => {
              router.push(
                `/workspaces/${workspaceId}/projects/${result.projectId}`,
              );
              router.refresh();
            })
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Bind failed");
              setPending(false);
            });
        }}
      >
        {pending ? "…" : "Bind"}
      </button>
      {error ? (
        <span className={styles.bindError} role="alert" title={error}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
