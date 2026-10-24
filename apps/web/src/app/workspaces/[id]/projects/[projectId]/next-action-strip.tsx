import Link from "next/link";
import { displayTaskTitle } from "@coppergate/db";
import styles from "./project-detail.module.css";

export type NextActionStep =
  | "budget"
  | "issue"
  | "arena"
  | "review"
  | "done";

type Props = {
  workspaceId: string;
  projectId: string;
  step: NextActionStep;
  reviewTaskId?: string | null;
  reviewTaskTitle?: string | null;
};

const PIPELINE: Array<{
  id: "budget" | "issue" | "arena" | "review";
  label: string;
}> = [
  { id: "budget", label: "Budget" },
  { id: "issue", label: "Issue" },
  { id: "arena", label: "Arena" },
  { id: "review", label: "Evidence" },
];

function stepIndex(step: NextActionStep): number {
  if (step === "done") return PIPELINE.length;
  return PIPELINE.findIndex((s) => s.id === step);
}

/**
 * Issue → Verified PR happy-path glue: one next action, no new orchestration.
 */
export function NextActionStrip({
  workspaceId,
  projectId,
  step,
  reviewTaskId,
  reviewTaskTitle,
}: Props) {
  const base = `/workspaces/${workspaceId}/projects/${projectId}`;
  const active = stepIndex(step);

  let title = "First verified PR complete";
  let detail =
    "Continue importing issues or keep Arena running under the spend envelope.";
  let href: string | undefined;
  let cta = "Open Delivery";

  if (step === "budget") {
    title = "Set an active spend envelope";
    detail =
      "Hard stop before agents run. One monthly pool pauses execution when spent.";
    href = `${base}?tab=overview#budget`;
    cta = "Set budget";
  } else if (step === "issue") {
    title = "Start from a GitHub issue";
    detail =
      "Import a small issue, confirm scope, then arm Arena for a verified PR.";
    href = `${base}?tab=overview#issues`;
    cta = "Import issue";
  } else if (step === "arena") {
    title = "Start execution in Arena";
    detail =
      "Contenders compete under budget. Fitness + CI decide the survivor.";
    href = `${base}?tab=arena`;
    cta = "Open Arena";
  } else if (step === "review") {
    const plainReview = displayTaskTitle(reviewTaskTitle);
    title = plainReview
      ? `Review evidence · ${plainReview}`
      : "Review delivery evidence";
    detail =
      "Gates passed or blocked — Accept only when CI and policy make the PR trustworthy.";
    href = reviewTaskId
      ? `${base}/tasks/${reviewTaskId}`
      : `${base}?tab=evidence`;
    cta = "Review evidence";
  } else {
    href = `${base}?tab=delivery`;
  }

  return (
    <section
      className={`${styles.section} ${styles.nextAction}`}
      aria-labelledby="next-action-heading"
    >
      <ol className={styles.pipeline} aria-label="Delivery pipeline">
        {PIPELINE.map((s, i) => {
          const done = i < active;
          const current = i === active && step !== "done";
          return (
            <li
              key={s.id}
              className={`${styles.pipelineStep} ${
                done
                  ? styles.pipelineDone
                  : current
                    ? styles.pipelineCurrent
                    : styles.pipelineTodo
              }`}
              aria-current={current ? "step" : undefined}
            >
              <span className={styles.pipelineIndex} aria-hidden>
                {done ? "✓" : i + 1}
              </span>
              <span className={styles.pipelineLabel}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      <div className={styles.nextActionBody}>
        <div className={styles.nextActionCopy}>
          <h2 id="next-action-heading" className={styles.sectionLabel}>
            Next action
          </h2>
          <p className={styles.nextActionTitle}>{title}</p>
          <p className={styles.sectionLede}>{detail}</p>
        </div>
        {href ? (
          <Link href={href} className={styles.primaryBtn}>
            {cta}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
