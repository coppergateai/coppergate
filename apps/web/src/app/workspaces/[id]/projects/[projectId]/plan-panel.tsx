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

  const agentsHref = `/workspaces/${workspaceId}/projects/${projectId}?tab=arena`;

  return (
    <section id="plan" className={styles.section} aria-labelledby="plan-heading">
      <h2 id="plan-heading" className={styles.sectionLabel}>
        Delivery plan
      </h2>
      <p className={styles.sectionLede}>
        Autonomously generated from Start — propose, build, review, merge. No
        manual brief or plan entry required.
      </p>

      {!plan ? (
        <p className={styles.muted}>
          Open{" "}
          <Link href={agentsHref}>Agents</Link>{" "}
          and press Start. Coppergate invents the vision, queues the next
          improvement, and ships through PR merge.
        </p>
      ) : null}

      {isOwner && plan ? (
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={pending || !hasApprovedBrief}
          onClick={() => void generate()}
        >
          {pending ? "Generating…" : "Regenerate plan"}
        </button>
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
                  ? ` · ~$${(m.estimatedCostMicros / 1_000_000).toFixed(2)} est.`
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
                        ? `$${(t.estimateMicros / 1_000_000).toFixed(2)}`
                        : "no estimate"}{" "}
                      · {t.status}
                      {t.dependsOnTaskIds.length
                        ? ` · waits on ${t.dependsOnTaskIds.length} predecessor${t.dependsOnTaskIds.length === 1 ? "" : "s"}`
                        : ""}
                    </div>
                    <div className={styles.taskScope}>Scope: {t.scope}</div>
                    <ul className={styles.criteria}>
                      {t.acceptanceCriteria.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    {t.status === "DRAFT" && t.dependsOnTaskIds.length > 0 ? (
                      <p className={styles.hint}>
                        Auto-queues after the predecessor is DONE — no Approve
                        needed.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
