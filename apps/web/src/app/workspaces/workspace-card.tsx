import Link from "next/link";
import styles from "./workspaces.module.css";

export type WorkspaceCardData = {
  id: string;
  name: string;
  slug: string;
  role: string;
  status: string;
  blurb: string;
  /** Display label, e.g. Oct 15, 2026 */
  updatedAt: string;
  /** ISO timestamp for sorting */
  updatedAtIso: string;
  projectCount: number;
  agentCount: number;
  runCount: number;
  memberCount: number;
  pendingApprovalCount: number;
};

type Props = {
  workspace: WorkspaceCardData;
  layout: "list" | "grid";
};

function formatRole(role: string) {
  if (role === "owner") return "Owner";
  if (role === "member") return "Member";
  return role;
}

export function WorkspaceCard({ workspace, layout }: Props) {
  const others = Math.max(0, workspace.memberCount - 1);
  const metaParts = [
    formatRole(workspace.role),
    others > 0 ? `${others} ${others === 1 ? "member" : "members"}` : null,
    `Updated ${workspace.updatedAt}`,
  ].filter(Boolean);

  return (
    <li className={layout === "grid" ? styles.cardGridItem : styles.cardListItem}>
      <Link href={`/workspaces/${workspace.id}`} className={styles.card}>
        <div className={styles.cardBody}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardName}>{workspace.name}</h2>
            <span className={styles.cardSlug}>/{workspace.slug}</span>
          </div>
          <p className={styles.cardBlurb}>{workspace.blurb}</p>
          <p className={styles.cardMeta}>{metaParts.join(" · ")}</p>
        </div>

        <div className={styles.cardStats} aria-label="Workspace stats">
          <div className={styles.stat}>
            <span className={styles.statValue}>{workspace.projectCount}</span>
            <span className={styles.statLabel}>Projects</span>
          </div>
          <div className={styles.stat}>
            <span
              className={
                workspace.pendingApprovalCount > 0
                  ? `${styles.statValue} ${styles.statValueWarn}`
                  : styles.statValue
              }
            >
              {workspace.pendingApprovalCount}
            </span>
            <span className={styles.statLabel}>Decisions</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{workspace.runCount}</span>
            <span className={styles.statLabel}>
              {workspace.runCount > 0 || workspace.agentCount > 0
                ? "Runs"
                : "Setup"}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}
