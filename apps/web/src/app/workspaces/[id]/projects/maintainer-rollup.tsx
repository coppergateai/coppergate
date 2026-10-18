"use client";

import { useEffect, useState } from "react";
import styles from "./projects.module.css";

type Props = { workspaceId: string };

type Rollup = {
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

function dollars(micros: number) {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

/** Multi-project maintainer KPI strip for workspace projects page. */
export function MaintainerRollup({ workspaceId }: Props) {
  const [rollup, setRollup] = useState<Rollup | null>(null);

  useEffect(() => {
    void fetch(`/api/workspaces/${workspaceId}/maintainer`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Rollup;
      })
      .then((data) => {
        if (data) setRollup(data);
      })
      .catch(() => {
        /* non-fatal */
      });
  }, [workspaceId]);

  if (!rollup || rollup.totals.maintainerProjectCount === 0) {
    return null;
  }

  return (
    <section className={styles.section} aria-label="Maintainer rollup">
      <h2 className={styles.sectionTitle}>Autonomous maintainers</h2>
      <p className={styles.lede}>
        {rollup.totals.maintainerProjectCount} project
        {rollup.totals.maintainerProjectCount === 1 ? "" : "s"} ·{" "}
        {rollup.totals.merges} merges (30d) · spend{" "}
        {dollars(rollup.totals.spendMicros)} · human PR touches{" "}
        {rollup.totals.humanTouches}
      </p>
    </section>
  );
}
