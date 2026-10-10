"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./settings.module.css";

export type ProjectBudgetRow = {
  projectId: string;
  name: string;
  repoFullName: string;
  capMicros: number;
  spentMicros: number;
  reservedMicros: number;
  availableMicros: number;
  currency: string;
  budgetStatus: string;
};

type Props = {
  workspaceId: string;
  isOwner: boolean;
  initialProjects: ProjectBudgetRow[];
};

export function ProjectsBudgetPanel({
  workspaceId,
  isOwner,
  initialProjects,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialProjects);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function setStatus(
    projectId: string,
    status: "active" | "paused",
    capMicros: number,
  ) {
    setPendingId(projectId);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, capMicros, status }),
      });
      const body = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Update failed");

      const usageRes = await fetch(
        `/api/projects/${projectId}/usage?workspaceId=${workspaceId}`,
        { credentials: "same-origin" },
      );
      const usageBody = (await usageRes.json()) as {
        usage?: {
          capMicros: number;
          spentMicros: number;
          reservedMicros: number;
          availableMicros: number;
          currency: string;
          budgetStatus: string;
        };
        error?: { message: string };
      };
      if (!usageRes.ok) {
        throw new Error(usageBody.error?.message ?? "Reload failed");
      }
      if (usageBody.usage) {
        setRows((prev) =>
          prev.map((r) =>
            r.projectId === projectId
              ? {
                  ...r,
                  ...usageBody.usage!,
                }
              : r,
          ),
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="budgets-heading">
      <h2 id="budgets-heading" className={styles.sectionLabel}>
        Project budgets
      </h2>
      <p className={styles.sectionLede}>
        Lower caps or pause spend. Workers refuse new agent work while paused.
      </p>

      {rows.length === 0 ? (
        <p className={styles.muted}>
          No projects yet.{" "}
          <Link
            href={`/workspaces/${workspaceId}/projects`}
            className={styles.inlineLink}
          >
            Create a project
          </Link>
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.projectId} className={styles.row}>
              <div>
                <Link
                  href={`/workspaces/${workspaceId}/projects/${row.projectId}`}
                  className={styles.rowTitle}
                >
                  {row.name}
                </Link>
                <p className={styles.rowMeta}>
                  {row.repoFullName} · cap {row.capMicros / 1_000_000}{" "}
                  {row.currency} · available {row.availableMicros / 1_000_000} ·{" "}
                  {row.budgetStatus}
                </p>
              </div>
              {isOwner ? (
                <div className={styles.rowActions}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pendingId === row.projectId}
                    onClick={() =>
                      void setStatus(
                        row.projectId,
                        row.budgetStatus === "paused" ? "active" : "paused",
                        row.capMicros,
                      )
                    }
                  >
                    {row.budgetStatus === "paused"
                      ? "Resume spend"
                      : "Pause spend"}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    disabled={pendingId === row.projectId}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Archive project “${row.name}”? It will leave the active list.`,
                        )
                      ) {
                        return;
                      }
                      setPendingId(row.projectId);
                      setError(null);
                      void fetch(
                        `/api/projects/${row.projectId}?workspaceId=${workspaceId}`,
                        { method: "DELETE", credentials: "same-origin" },
                      )
                        .then(async (res) => {
                          if (!res.ok) {
                            const body = (await res.json()) as {
                              error?: { message: string };
                            };
                            throw new Error(
                              body.error?.message ?? "Archive failed",
                            );
                          }
                          setRows((prev) =>
                            prev.filter((r) => r.projectId !== row.projectId),
                          );
                          router.refresh();
                        })
                        .catch((err: unknown) => {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Archive failed",
                          );
                        })
                        .finally(() => setPendingId(null));
                    }}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
