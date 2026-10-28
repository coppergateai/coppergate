"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  describeL2AutoMerge,
  describeMinHumanHonesty,
  effectiveArenaMinHuman,
} from "@/lib/project-settings-honesty";
import styles from "./project-detail.module.css";

type Props = {
  workspaceId: string;
  projectId: string;
  initialAutonomy: string;
  initialMergeEnabled: boolean;
  arenaMinHumanStored: boolean | null;
  maintainerEnabled: boolean;
  isOwner: boolean;
};

export function PolicyPresetsPanel({
  workspaceId,
  projectId,
  initialAutonomy,
  initialMergeEnabled,
  arenaMinHumanStored,
  maintainerEnabled,
  isOwner,
}: Props) {
  const router = useRouter();
  const [autonomy, setAutonomy] = useState(initialAutonomy);
  const [mergeEnabled, setMergeEnabled] = useState(initialMergeEnabled);
  const [storedMinHuman, setStoredMinHuman] = useState<boolean | null>(
    arenaMinHumanStored,
  );
  const [maintainerOn, setMaintainerOn] = useState(maintainerEnabled);
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
        if (res.ok && body.arena) {
          setStoredMinHuman(body.arena.minHuman ?? null);
        }
      })
      .catch(() => undefined);
  }, [projectId, workspaceId]);

  const effectiveMinHuman = effectiveArenaMinHuman(storedMinHuman);

  const minHumanHonesty = useMemo(
    () => describeMinHumanHonesty(storedMinHuman),
    [storedMinHuman],
  );

  const mergeHonesty = useMemo(
    () =>
      describeL2AutoMerge({
        autonomyLevel: autonomy,
        mergeEnabled,
        maintainerEnabled: maintainerOn,
        maintainerAutoMerge: true,
      }),
    [autonomy, mergeEnabled, maintainerOn],
  );

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
        project?: {
          autonomyLevel?: string;
          mergeEnabled?: boolean;
          maintainerEnabled?: boolean;
        };
        minHuman?: boolean | null;
        effectiveMinHuman?: boolean;
      };
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Update failed");
      }
      if (data.project?.autonomyLevel) setAutonomy(data.project.autonomyLevel);
      if (typeof data.project?.mergeEnabled === "boolean") {
        setMergeEnabled(data.project.mergeEnabled);
      }
      if (typeof data.project?.maintainerEnabled === "boolean") {
        setMaintainerOn(data.project.maintainerEnabled);
      }
      if (data.minHuman === null || typeof data.minHuman === "boolean") {
        setStoredMinHuman(data.minHuman);
      }
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
        Autonomy gate, L2 merge opt-in, and min_human — effective behavior
        matches worker gates (not checkbox labels alone).
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
        <p className={styles.hint} role="status">
          {mergeHonesty.acceptSummary}
          {mergeHonesty.maintainerPathActive
            ? ` ${mergeHonesty.maintainerSummary}`
            : mergeHonesty.acceptPathActive
              ? ` ${mergeHonesty.maintainerSummary}`
              : null}
        </p>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={effectiveMinHuman}
            disabled={!isOwner || pending}
            onChange={(e) => {
              const next = e.target.checked;
              setStoredMinHuman(next);
              void patch({ minHuman: next });
            }}
          />
          min_human (skip inbox when on)
        </label>
        <p className={styles.hint} role="status">
          {minHumanHonesty.summary}
        </p>
      </div>
    </section>
  );
}
