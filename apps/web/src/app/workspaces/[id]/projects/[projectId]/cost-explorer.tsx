"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./project-detail.module.css";

type CostData = {
  windowDays: number;
  spentMicros: number;
  topTasks: Array<{
    taskId: string;
    title: string | null;
    spentMicros: number;
  }>;
};

type Props = {
  workspaceId: string;
  projectId: string;
};

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function CostExplorerStrip({ workspaceId, projectId }: Props) {
  const [data, setData] = useState<CostData | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/cost?workspaceId=${encodeURIComponent(workspaceId)}&days=7`,
    );
    const body = (await res.json()) as { cost?: CostData };
    if (res.ok && body.cost) setData(body.cost);
  }, [projectId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return null;

  return (
    <section
      id="cost"
      className={styles.section}
      aria-labelledby="cost-heading"
    >
      <h2 id="cost-heading" className={styles.sectionLabel}>
        Cost explorer (7d)
      </h2>
      <p className={styles.sectionLede}>
        Ledger spend (tokens + sandbox): {usd(data.spentMicros)} in the last{" "}
        {data.windowDays} days — excludes estimate reservations
        {data.topTasks.length
          ? ` · top ${data.topTasks.length} task${data.topTasks.length === 1 ? "" : "s"}`
          : " · no task-attributed spend yet"}
        . Provider/BYOK invoices are billed separately.
      </p>
      {data.topTasks.length > 0 ? (
        <ul className={styles.costList}>
          {data.topTasks.map((t) => (
            <li key={t.taskId} className={styles.costRow}>
              <span className={styles.costTitle}>
                {t.title ?? t.taskId.slice(0, 8)}
              </span>
              <span className={styles.costAmt}>{usd(t.spentMicros)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
