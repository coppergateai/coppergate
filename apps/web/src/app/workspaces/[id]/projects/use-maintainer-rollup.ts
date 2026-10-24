"use client";

import { useEffect, useState } from "react";

export type MaintainerRollup = {
  totals: {
    merges: number;
    spendMicros: number;
    humanTouches: number;
    maintainerProjectCount: number;
  };
  projects: Array<{
    projectId: string;
    merges: number;
    spendMicros: number;
    capMicros: number;
    humanTouches: number;
  }>;
};

export function dollars(micros: number) {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

/** Workspace maintainer KPI rollup (owner-gated API; null when unavailable). */
export function useMaintainerRollup(workspaceId: string) {
  const [rollup, setRollup] = useState<MaintainerRollup | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/workspaces/${workspaceId}/maintainer`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as MaintainerRollup;
      })
      .then((data) => {
        if (!cancelled && data) setRollup(data);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return rollup;
}
