"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

type PlanTask = {
  id: string;
  title: string;
  goal: string;
  scope: string;
  status: string;
  estimateMicros: number | null;
  estimateComplexity: string | null;
  acceptanceCriteria: string[];
  dependsOnTaskIds: string[];
};

type PlanMilestone = {
  id: string;
  title: string;
  description: string;
  sequence: number;
  status: string;
  estimatedCostMicros: number | null;
  tasks: PlanTask[];
};

type Plan = {
  briefId: string;
  milestones: PlanMilestone[];
  dependencyCount: number;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialPlan: Plan | null;
  hasApprovedBrief: boolean;
  isOwner: boolean;
};

export function PlanPanel({
  workspaceId,
  projectId,
  initialPlan,
  hasApprovedBrief,
  isOwner,
}: Props) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(initialPlan);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/plan/generate`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = (await res.json()) as {
        plan?: Plan;
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? "Generate failed");
      if (body.plan) setPlan(body.plan);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setPending(false);
    }
  }

  async function transitionTask(
    taskId: string,
    action: "submit" | "approve",
  ) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const body = (await res.json()) as {
        task?: { id: string; status: string };
        error?: { message: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `${action} failed`);
      if (body.task && plan) {
        setPlan({
          ...plan,
          milestones: plan.milestones.map((m) => ({
            ...m,
            tasks: m.tasks.map((t) =>
              t.id === body.task!.id ? { ...t, status: body.task!.status } : t,
            ),
          })),
        });
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setPending(false);
    }
  }

  return (
    <section style={{ marginTop: "2.5rem" }}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        Delivery plan
      </h2>
      <p style={{ margin: "0 0 1rem", color: "#737373", fontSize: "0.875rem" }}>
        Milestones and tasks from the approved brief (FR-03). Each task includes
        scope, dependencies, estimate, and acceptance criteria.
      </p>

      {isOwner ? (
        <button
          type="button"
          disabled={pending || !hasApprovedBrief}
          onClick={() => void generate()}
          style={btnStyle}
        >
          {pending
            ? "Generating…"
            : plan
              ? "Regenerate plan"
              : "Generate plan"}
        </button>
      ) : null}

      {!hasApprovedBrief ? (
        <p style={{ marginTop: "0.75rem", color: "#737373", fontSize: "0.875rem" }}>
          Approve a product brief first.
        </p>
      ) : null}

      {error ? (
        <p style={{ marginTop: "0.75rem", color: "#F87171", fontSize: "0.875rem" }}>
          {error}
        </p>
      ) : null}

      {plan ? (
        <div style={{ marginTop: "1.5rem", display: "grid", gap: "1.5rem" }}>
          <p style={{ margin: 0, color: "#A3A3A3", fontSize: "0.8rem" }}>
            {plan.milestones.length} milestones ·{" "}
            {plan.milestones.reduce((n, m) => n + m.tasks.length, 0)} tasks ·{" "}
            {plan.dependencyCount} dependencies
          </p>
          {plan.milestones.map((m) => (
            <div key={m.id}>
              <h3
                style={{
                  margin: "0 0 0.35rem",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                }}
              >
                {m.sequence}. {m.title}
              </h3>
              <p style={{ margin: "0 0 0.75rem", color: "#737373", fontSize: "0.8rem" }}>
                {m.description}
                {m.estimatedCostMicros != null
                  ? ` · ~${(m.estimatedCostMicros / 100).toFixed(0)}¢ est.`
                  : ""}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {m.tasks.map((t) => (
                  <li
                    key={t.id}
                    style={{
                      padding: "0.75rem 0",
                      borderTop: "1px solid #262626",
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      <Link
                        href={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${t.id}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {t.title}
                      </Link>
                    </div>
                    <div
                      style={{
                        color: "#737373",
                        fontSize: "0.8rem",
                        marginTop: 4,
                      }}
                    >
                      {t.estimateComplexity ?? "?"} ·{" "}
                      {t.estimateMicros != null
                        ? `${(t.estimateMicros / 100).toFixed(0)}¢`
                        : "no estimate"}{" "}
                      · {t.status}
                      {t.dependsOnTaskIds.length
                        ? ` · depends on ${t.dependsOnTaskIds.length}`
                        : ""}
                    </div>
                    <div
                      style={{
                        color: "#A3A3A3",
                        fontSize: "0.8rem",
                        marginTop: 6,
                      }}
                    >
                      Scope: {t.scope}
                    </div>
                    <ul
                      style={{
                        margin: "0.4rem 0 0",
                        paddingLeft: "1.1rem",
                        color: "#E5E5E5",
                        fontSize: "0.8rem",
                      }}
                    >
                      {t.acceptanceCriteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    {isOwner &&
                    (t.status === "DRAFT" ||
                      t.status === "READY_FOR_APPROVAL") ? (
                      <div
                        style={{
                          display: "flex",
                          gap: "0.4rem",
                          marginTop: "0.55rem",
                        }}
                      >
                        {t.status === "DRAFT" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void transitionTask(t.id, "submit")}
                            style={btnSmall}
                          >
                            Submit
                          </button>
                        ) : null}
                        {t.status === "READY_FOR_APPROVAL" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => void transitionTask(t.id, "approve")}
                            style={btnSmall}
                          >
                            Approve → queue
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : hasApprovedBrief ? (
        <p style={{ marginTop: "1rem", color: "#737373" }}>
          No plan yet. Generate one from the approved brief.
        </p>
      ) : null}
    </section>
  );
}

const btnStyle: CSSProperties = {
  padding: "0.7rem 1rem",
  background: "#FFFFFF",
  color: "#0A0A0A",
  border: "none",
  borderRadius: 4,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSmall: CSSProperties = {
  ...btnStyle,
  padding: "0.4rem 0.7rem",
  fontSize: "0.8rem",
  background: "transparent",
  color: "#FFFFFF",
  border: "1px solid #404040",
};
