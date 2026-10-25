"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { displayTaskTitle } from "@/lib/display-title";
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

function taskStatusLabel(status: string): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "READY_FOR_APPROVAL":
      return "Needs approval";
    case "QUEUED":
      return "Queued";
    case "RUNNING":
      return "Running";
    case "VALIDATING":
      return "Validating";
    case "REVIEW_REQUIRED":
      return "In review";
    case "ACCEPTED":
      return "Accepted";
    case "DONE":
      return "Done";
    case "FAILED":
      return "Failed";
    case "BLOCKED":
      return "Blocked";
    case "CANCELLED":
      return "Cancelled";
    case "EXPIRED":
      return "Expired";
    case "NEEDS_REPLAN":
      return "Needs replan";
    default:
      return status.replace(/_/g, " ");
  }
}

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

  const arenaHref = `/workspaces/${workspaceId}/projects/${projectId}?tab=arena`;
  const doneStatuses = new Set(["ACCEPTED", "DONE", "CANCELLED", "EXPIRED"]);
  const openMilestoneId =
    plan?.milestones.find((m) =>
      m.tasks.some((t) => !doneStatuses.has(t.status)),
    )?.id ?? plan?.milestones[0]?.id;

  return (
    <section id="plan" className={styles.section} aria-labelledby="plan-heading">
      <div className={styles.sectionHead}>
        <h2 id="plan-heading" className={styles.sectionLabel}>
          Delivery plan
        </h2>
        {isOwner && plan ? (
          <button
            type="button"
            className={styles.ghostBtn}
            disabled={pending || !hasApprovedBrief}
            onClick={() => void generate()}
          >
            {pending ? "Generating…" : "Regenerate"}
          </button>
        ) : null}
      </div>
      <p className={styles.sectionLede}>
        Autonomously generated from Start — propose, build, review, merge.
      </p>

      {!plan ? (
        <p className={styles.muted}>
          Open{" "}
          <Link href={arenaHref} className={styles.inlineLink}>
            Arena
          </Link>{" "}
          and press Start. Coppergate invents the vision, queues the next
          improvement, and ships through PR merge.
        </p>
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
            <details
              key={m.id}
              className={styles.milestoneDetails}
              open={m.id === openMilestoneId}
            >
              <summary className={styles.milestoneSummary}>
                <span className={styles.subTitle}>
                  {m.sequence}. {m.title}
                </span>
                <span className={styles.milestoneMeta}>
                  {m.tasks.length} task{m.tasks.length === 1 ? "" : "s"}
                  {m.estimatedCostMicros != null
                    ? ` · ~$${(m.estimatedCostMicros / 1_000_000).toFixed(2)}`
                    : ""}
                </span>
              </summary>
              <p className={styles.muted}>{m.description}</p>
              <ul className={styles.taskList}>
                {m.tasks.map((t) => (
                  <li key={t.id} className={styles.taskItem}>
                    <div>
                      <Link
                        href={`/workspaces/${workspaceId}/projects/${projectId}/tasks/${t.id}`}
                        className={styles.taskTitle}
                      >
                        {displayTaskTitle(t.title) || t.title}
                      </Link>
                    </div>
                    <div className={styles.taskMeta}>
                      {t.estimateComplexity ?? "?"} ·{" "}
                      {t.estimateMicros != null
                        ? `$${(t.estimateMicros / 1_000_000).toFixed(2)}`
                        : "no estimate"}{" "}
                      · {taskStatusLabel(t.status)}
                      {t.dependsOnTaskIds.length
                        ? ` · waits on ${t.dependsOnTaskIds.length} predecessor${t.dependsOnTaskIds.length === 1 ? "" : "s"}`
                        : ""}
                    </div>
                    <details className={styles.taskDetails}>
                      <summary>Scope &amp; criteria</summary>
                      <div className={styles.taskScope}>Scope: {t.scope}</div>
                      {t.acceptanceCriteria.length > 0 ? (
                        <ul className={styles.criteria}>
                          {t.acceptanceCriteria.map((c) => (
                            <li key={c}>{c}</li>
                          ))}
                        </ul>
                      ) : null}
                    </details>
                    {t.status === "DRAFT" && t.dependsOnTaskIds.length > 0 ? (
                      <p className={styles.hint}>
                        Auto-queues after the predecessor is DONE — no Approve
                        needed.
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      ) : null}
    </section>
  );
}
