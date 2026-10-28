"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/app/ui";
import styles from "./insights.module.css";

type CostData = {
  windowDays: number;
  spentMicros: number;
  projects: Array<{
    projectId: string;
    name: string;
    spentMicros: number;
  }>;
};

type Props = {
  workspaceId: string;
};

function usd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

export function CostByProject({ workspaceId }: Props) {
  const [data, setData] = useState<CostData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}/cost?days=7`);
    const body = (await res.json()) as {
      cost?: CostData;
      error?: { message?: string };
    };
    if (!res.ok) {
      setError(body.error?.message ?? "Failed to load cost");
      return;
    }
    setData(body.cost ?? null);
    setError(null);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.section} aria-labelledby="cost-7d-heading">
      <h2 id="cost-7d-heading" className={styles.sectionLabel}>
        Cost by project (7d)
      </h2>
      <p className={styles.sectionLede}>
        Coppergate budget units by project (internal estimates) — not your
        OpenAI/BYOK invoice.
      </p>
      {error ? <p className={styles.error}>{error}</p> : null}
      {data ? (
        <>
          <p className={styles.note}>
            Workspace total: <strong>{usd(data.spentMicros)}</strong>
          </p>
          {data.projects.length === 0 ? (
            <EmptyState
              title="No usage in this window"
              body={`No project spend in the last ${data.windowDays} days.`}
            />
          ) : (
            <ul className={styles.costList}>
              {data.projects.slice(0, 8).map((p) => (
                <li key={p.projectId} className={styles.costRow}>
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${p.projectId}`}
                    className={styles.costLink}
                  >
                    {p.name}
                  </Link>
                  <span>{usd(p.spentMicros)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className={styles.note}>Loading…</p>
      )}
    </section>
  );
}
