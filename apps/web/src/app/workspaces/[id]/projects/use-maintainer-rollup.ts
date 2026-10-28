"use client";

import { useEffect, useState } from "react";

export type MaintainerRollup = {
  windowDays: number;
  workspace: {
    spentMicros: number;
    capMicros: number;
    budgetBurnRatio: number | null;
    pooled: boolean;
  };
  totals: {
    merges: number;
    verifiedMerges: number;
    spendMicros: number;
    capMicros: number;
    budgetBurnRatio: number | null;
    humanTouches: number;
    maintainerProjectCount: number;
    zeroTouchDelivery: boolean;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    merges: number;
    verifiedMerges: number;
    spendMicros: number;
    capMicros: number;
    budgetBurnRatio: number | null;
    humanTouches: number;
  }>;
};

export function dollars(micros: number) {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

export function burnPercent(ratio: number | null | undefined) {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
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
