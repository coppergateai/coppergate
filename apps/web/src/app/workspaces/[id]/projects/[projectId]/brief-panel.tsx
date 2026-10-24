"use client";

import Link from "next/link";
import { EmptyState } from "@/components/app/ui";
import styles from "./project-detail.module.css";

type Brief = {
  id: string;
  revision: number;
  status: string;
  title: string;
  targetUser: string;
  problem: string;
  scope: string;
  nonGoals: string;
  acceptanceCriteria: string[];
  rawIdea: string;
};

type Props = {
  workspaceId: string;
  projectId: string;
  initialBrief: Brief | null;
  isOwner: boolean;
};

/**
 * Manual idea → brief entry is retired. Start in Arena bootstraps vision.
 * This panel only surfaces the auto vision when one already exists.
 */
export function BriefPanel({
  workspaceId,
  projectId,
  initialBrief,
  isOwner,
}: Props) {
  const arenaHref = `/workspaces/${workspaceId}/projects/${projectId}?tab=arena`;
  const brief = initialBrief;

  return (
    <section
      id="brief"
      className={styles.section}
      aria-labelledby="brief-heading"
    >
      <h2 id="brief-heading" className={styles.sectionLabel}>
        Vision
      </h2>
      <p className={styles.sectionLede}>
        Invented automatically when you Start — no idea or brief to type.
        {brief ? (
          <>
            {" "}
            Revision {brief.revision} · <code>{brief.status}</code>
          </>
        ) : null}
      </p>

      {!brief ? (
        <EmptyState
          title="No vision yet"
          body={
            isOwner
              ? "Open Arena and press Start. Coppergate writes the vision, queues work, and ships under budget."
              : "An owner starts the autonomous loop from Arena."
          }
          action={
            isOwner ? (
              <Link href={arenaHref} className={styles.linkCta}>
                Open Arena → Start
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className={`${styles.stack} ${styles.milestones}`}>
          <p className={styles.hint}>
            Autonomously maintained. Change course with Stop / budget — not by
            editing an idea form.
          </p>
          <div className={styles.field}>
            <span className={styles.sectionLabel}>Title</span>
            <div className={styles.readonly}>{brief.title || "—"}</div>
          </div>
          <div className={styles.field}>
            <span className={styles.sectionLabel}>Problem</span>
            <div className={styles.readonly}>{brief.problem || "—"}</div>
          </div>
          <div className={styles.field}>
            <span className={styles.sectionLabel}>Scope</span>
            <div className={styles.readonly}>{brief.scope || "—"}</div>
          </div>
          {brief.acceptanceCriteria.length > 0 ? (
            <div className={styles.field}>
              <span className={styles.sectionLabel}>Acceptance</span>
              <ul className={styles.criteria}>
                {brief.acceptanceCriteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {isOwner ? (
            <Link href={arenaHref} className={styles.linkCta}>
              Arena → Start / Stop
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
