"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  estimateMicros: number | null;
  estimateComplexity: string | null;
  milestoneTitle: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  tasks: BoardTask[];
};

const COLUMNS: { key: string; label: string; match: (s: string) => boolean }[] =
  [
    {
      key: "backlog",
      label: "Backlog",
      match: (s) => s === "DRAFT" || s === "READY_FOR_APPROVAL",
    },
    {
      key: "queued",
      label: "Queued",
      match: (s) => s === "QUEUED",
    },
    {
      key: "active",
      label: "Running",
      match: (s) =>
        s === "RUNNING" || s === "VALIDATING" || s === "REVIEW_REQUIRED",
    },
    {
      key: "done",
      label: "Accepted",
      match: (s) => s === "ACCEPTED" || s === "DONE",
    },
    {
      key: "blocked",
      label: "Failed / blocked",
      match: (s) =>
        s === "FAILED" ||
        s === "BLOCKED" ||
        s === "CANCELLED" ||
        s === "EXPIRED" ||
        s === "NEEDS_REPLAN",
    },
  ];

export function DeliveryBoard({ workspaceId, projectId, tasks }: Props) {
  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Delivery board
      </h2>
      <p style={{ margin: "0 0 1.25rem", color: "#737373", fontSize: "0.875rem" }}>
        Tasks by workflow status. Open a task to watch fake-agent events and cost.
      </p>

      {tasks.length === 0 ? (
        <p style={{ color: "#737373", fontSize: "0.875rem" }}>
          Generate a plan to populate the board.
        </p>
      ) : (
        <div style={boardGrid}>
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => col.match(t.status));
            return (
              <div key={col.key} style={columnStyle}>
                <div style={columnHead}>
                  {col.label}
                  <span style={{ color: "#737373", fontWeight: 400 }}>
                    {" "}
                    {items.length}
                  </span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {items.map((t) => (
                    <li key={t.id} style={cardStyle}>
                      <Link
                        href={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${t.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                          {t.title}
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            color: "#737373",
                            fontSize: "0.75rem",
                          }}
                        >
                          {t.milestoneTitle} · {t.status}
                          {t.estimateMicros != null
                            ? ` · ${(t.estimateMicros / 100).toFixed(0)}¢`
                            : ""}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const boardGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "0.75rem",
};

const columnStyle: CSSProperties = {
  minWidth: 0,
  borderTop: "2px solid #404040",
  paddingTop: "0.5rem",
};

const columnHead: CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  color: "#A3A3A3",
  marginBottom: "0.5rem",
};

const cardStyle: CSSProperties = {
  padding: "0.55rem 0",
  borderBottom: "1px solid #262626",
};
