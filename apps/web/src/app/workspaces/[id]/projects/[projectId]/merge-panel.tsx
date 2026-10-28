"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { describeL2AutoMerge } from "@coppergate/db";
import styles from "./project-detail.module.css";

type Props = {
  workspaceId: string;
  projectId: string;
  initialMergeEnabled: boolean;
  autonomyLevel: string;
  maintainerEnabled: boolean;
  isOwner: boolean;
};

export function MergePanel({
  workspaceId,
  projectId,
  initialMergeEnabled,
  autonomyLevel,
  maintainerEnabled,
  isOwner,
}: Props) {
  const router = useRouter();
  const [mergeEnabled, setMergeEnabled] = useState(initialMergeEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const mergeHonesty = useMemo(
    () =>
      describeL2AutoMerge({
        autonomyLevel,
        mergeEnabled,
        maintainerEnabled,
        maintainerAutoMerge: true,
      }),
    [autonomyLevel, mergeEnabled, maintainerEnabled],
  );

  return (
    <section
      id="merge"
      className={styles.section}
      aria-labelledby="merge-heading"
    >
      <h2 id="merge-heading" className={styles.sectionLabel}>
        L2 merge (opt-in)
      </h2>
      <p className={styles.sectionLede}>
        Policy-gated merge to the default branch — not a production deploy
        switch. Default off. Current autonomy: {autonomyLevel}.
      </p>
      <p className={styles.hint} role="status">
        Accept path:{" "}
        {mergeHonesty.acceptPathActive ? "active" : "inactive"} —{" "}
        {mergeHonesty.acceptSummary}
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
