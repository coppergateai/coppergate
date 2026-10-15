"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

type Props = {
  workspaceId: string;
  projectId: string;
  initialAutonomy: string;
  initialMergeEnabled: boolean;
  isOwner: boolean;
};

export function PolicyPresetsPanel({
  workspaceId,
  projectId,
  initialAutonomy,
  initialMergeEnabled,
  isOwner,
}: Props) {
  const router = useRouter();
  const [autonomy, setAutonomy] = useState(initialAutonomy);
  const [mergeEnabled, setMergeEnabled] = useState(initialMergeEnabled);
  const [minHuman, setMinHuman] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch(
      `/api/projects/${projectId}/arena?workspaceId=${encodeURIComponent(workspaceId)}`,
    )
      .then(async (res) => {
        const body = (await res.json()) as {
          arena?: { minHuman?: boolean } | null;
        };
        if (res.ok) setMinHuman(body.arena?.minHuman ?? false);
      })
      .catch(() => undefined);
  }, [projectId, workspaceId]);

  async function patch(body: Record<string, unknown>) {
    if (!isOwner) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/policy`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, ...body }),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        project?: { autonomyLevel?: string; mergeEnabled?: boolean };
        minHuman?: boolean | null;
      };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Update failed");
      }
      if (data.project?.autonomyLevel) setAutonomy(data.project.autonomyLevel);
      if (typeof data.project?.mergeEnabled === "boolean") {
        setMergeEnabled(data.project.mergeEnabled);
      }
      if (typeof data.minHuman === "boolean") setMinHuman(data.minHuman);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="policy"
      className={styles.section}
      aria-labelledby="policy-heading"
    >
      <h2 id="policy-heading" className={styles.sectionLabel}>
        Policy presets
      </h2>
      <p className={styles.sectionLede}>
        Autonomy gate, L2 merge opt-in, and min_human in one place.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.panel}>
        <label className={styles.field}>
          Autonomy
          <select
            className={styles.select}
            value={autonomy}
            disabled={!isOwner || pending}
            onChange={(e) => {
              const next = e.target.value;
              setAutonomy(next);
              void patch({ autonomyLevel: next });
            }}
          >
            <option value="L0">L0 — approve everything</option>
            <option value="L1">L1 — approve high-risk</option>
            <option value="L2">L2 — autonomous within budget</option>
          </select>
        </label>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={mergeEnabled}
            disabled={!isOwner || pending}
            onChange={(e) => {
              const next = e.target.checked;
              setMergeEnabled(next);
              void patch({ mergeEnabled: next });
            }}
          />
          Merge after accept (L2)
        </label>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={minHuman ?? false}
            disabled={!isOwner || pending || minHuman === null}
            onChange={(e) => {
              const next = e.target.checked;
              setMinHuman(next);
              void patch({ minHuman: next });
            }}
          />
          min_human (skip inbox when on)
        </label>
      </div>
    </section>
  );
}
