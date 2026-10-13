"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type Props = {
  workspaceId: string;
  projectId: string;
  initialMergeEnabled: boolean;
  autonomyLevel: string;
  isOwner: boolean;
};

export function MergePanel({
  workspaceId,
  projectId,
  initialMergeEnabled,
  autonomyLevel,
  isOwner,
}: Props) {
  const router = useRouter();
  const [mergeEnabled, setMergeEnabled] = useState(initialMergeEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <section className={styles.section} aria-labelledby="merge-heading">
      <h2 id="merge-heading" className={styles.sectionLabel}>
        L2 merge (opt-in)
      </h2>
      <p className={styles.sectionLede}>
        When enabled and project autonomy is L2, accepting a review attempts to
        merge the PR. Default off — survivors still stop at human accept.
        Current autonomy: {autonomyLevel}.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={mergeEnabled}
          disabled={!isOwner || pending}
          onChange={(e) => {
            const next = e.target.checked;
            setPending(true);
            setError(null);
            void fetch(`/api/projects/${projectId}/merge`, {
              method: "PATCH",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId, mergeEnabled: next }),
            })
              .then(async (res) => {
                const body = (await res.json()) as {
                  error?: { message?: string };
                  project?: { mergeEnabled?: boolean };
                };
                if (!res.ok) {
                  throw new Error(body.error?.message ?? "Update failed");
                }
                setMergeEnabled(Boolean(body.project?.mergeEnabled));
                router.refresh();
              })
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Update failed");
              })
              .finally(() => setPending(false));
          }}
        />
        Merge after accept (policy-gated)
      </label>
    </section>
  );
}
