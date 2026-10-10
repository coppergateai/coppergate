"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

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
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Project budgets
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#A3A3A3", fontSize: "0.875rem" }}>
        Lower caps or pause spend. Workers refuse new agent work while paused.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: "#737373", fontSize: "0.875rem" }}>
          No projects yet.{" "}
          <Link
            href={`/workspaces/${workspaceId}/projects`}
            style={{ color: "#A3A3A3" }}
          >
            Create a project
          </Link>
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((row) => (
            <li
              key={row.projectId}
              style={{
                padding: "0.85rem 0",
                borderBottom: "1px solid #262626",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <Link
                    href={`/workspaces/${workspaceId}/projects/${row.projectId}`}
                    style={{ color: "#FFFFFF", fontWeight: 600 }}
                  >
                    {row.name}
                  </Link>
                  <p
                    style={{
                      margin: "0.25rem 0 0",
                      color: "#737373",
                      fontSize: "0.8rem",
                    }}
                  >
                    {row.repoFullName} · cap {row.capMicros / 1_000_000}{" "}
                    {row.currency} · available {row.availableMicros / 1_000_000}{" "}
                    · {row.budgetStatus}
                  </p>
                </div>
                {isOwner ? (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={pendingId === row.projectId}
                      onClick={() =>
                        void setStatus(
                          row.projectId,
                          row.budgetStatus === "paused" ? "active" : "paused",
                          row.capMicros,
                        )
                      }
                      style={ghostBtn}
                    >
                      {row.budgetStatus === "paused"
                        ? "Resume spend"
                        : "Pause spend"}
                    </button>
                    <button
                      type="button"
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
                      style={ghostBtn}
                    >
                      Archive
                    </button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#F87171", fontSize: "0.875rem" }}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

const ghostBtn: CSSProperties = {
  padding: "0.45rem 0.75rem",
  background: "transparent",
  color: "#FFFFFF",
  border: "1px solid #404040",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: "0.8rem",
};
