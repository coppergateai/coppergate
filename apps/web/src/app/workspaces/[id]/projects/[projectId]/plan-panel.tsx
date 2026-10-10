"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./project-detail.module.css";

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
    <section className={styles.section} aria-labelledby="plan-heading">
      <h2 id="plan-heading" className={styles.sectionLabel}>
        Delivery plan
      </h2>
      <p className={styles.sectionLede}>
        Milestones and tasks from the approved brief (FR-03). Each task includes
        scope, dependencies, estimate, and acceptance criteria.
      </p>

      {isOwner ? (
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={pending || !hasApprovedBrief}
          onClick={() => void generate()}
        >
          {pending
            ? "Generating…"
            : plan
              ? "Regenerate plan"
              : "Generate plan"}
        </button>
      ) : null}

      {!hasApprovedBrief ? (
        <p className={styles.muted}>Approve a product brief first.</p>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {plan ? (
        <div className={styles.milestones}>
          <p className={styles.hint}>
            {plan.milestones.length} milestones ·{" "}
            {plan.milestones.reduce((n, m) => n + m.tasks.length, 0)} tasks ·{" "}
            {plan.dependencyCount} dependencies
          </p>
          {plan.milestones.map((m) => (
            <div key={m.id}>
              <h3 className={styles.subTitle}>
                {m.sequence}. {m.title}
              </h3>
              <p className={styles.muted}>
                {m.description}
                {m.estimatedCostMicros != null
                  ? ` · ~${(m.estimatedCostMicros / 100).toFixed(0)}¢ est.`
                  : ""}
              </p>
              <ul className={styles.taskList}>
                {m.tasks.map((t) => (
                  <li key={t.id} className={styles.taskItem}>
                    <div>
                      <Link
                        href={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${t.id}`}
                        className={styles.taskTitle}
                      >
                        {t.title}
                      </Link>
                    </div>
                    <div className={styles.taskMeta}>
                      {t.estimateComplexity ?? "?"} ·{" "}
                      {t.estimateMicros != null
                        ? `${(t.estimateMicros / 100).toFixed(0)}¢`
                        : "no estimate"}{" "}
                      · {t.status}
                      {t.dependsOnTaskIds.length
                        ? ` · depends on ${t.dependsOnTaskIds.length}`
                        : ""}
                    </div>
                    <div className={styles.taskScope}>Scope: {t.scope}</div>
                    <ul className={styles.criteria}>
                      {t.acceptanceCriteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    {isOwner &&
                    (t.status === "DRAFT" ||
                      t.status === "READY_FOR_APPROVAL") ? (
                      <div className={styles.btnRow}>
                        {t.status === "DRAFT" ? (
                          <button
                            type="button"
                            className={styles.smallBtn}
                            disabled={pending}
                            onClick={() => void transitionTask(t.id, "submit")}
                          >
                            Submit
                          </button>
                        ) : null}
                        {t.status === "READY_FOR_APPROVAL" ? (
                          <button
                            type="button"
                            className={styles.smallBtn}
                            disabled={pending}
                            onClick={() => void transitionTask(t.id, "approve")}
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
        <p className={styles.muted}>
          No plan yet. Generate one from the approved brief.
        </p>
      ) : null}
    </section>
  );
}
