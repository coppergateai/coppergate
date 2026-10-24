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

  return (
    <li className={layout === "grid" ? styles.cardGridItem : styles.cardListItem}>
      <Link href={`/workspaces/${workspace.id}`} className={styles.card}>
        <div className={styles.cardIcon} aria-hidden>
          <span>&gt;_</span>
        </div>

        <div className={styles.cardBody}>
          <div className={styles.cardTitleRow}>
            <h2 className={styles.cardName}>{workspace.name}</h2>
            <span className={styles.cardSlug}>/{workspace.slug}</span>
          </div>
          <p className={styles.cardBlurb}>{workspace.blurb}</p>
          <div className={styles.cardMeta}>
            <span className={styles.metaPill}>
              <PersonIcon />
              {formatRole(workspace.role)}
            </span>
            <span className={styles.metaPill}>
              {others} {others === 1 ? "member" : "members"}
            </span>
            <span className={styles.metaPill}>
              <CalendarIcon />
              Updated {workspace.updatedAt}
            </span>
          </div>
        </div>

        <div className={styles.cardStats} aria-label="Workspace stats">
          <div className={styles.stat}>
            <BoltIcon />
            <span className={styles.statValue}>{workspace.projectCount}</span>
            <span className={styles.statLabel}>Projects</span>
          </div>
          <div className={styles.stat}>
            <CubeIcon />
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
            <PlayIcon />
            <span className={styles.statValue}>{workspace.runCount}</span>
            <span className={styles.statLabel}>
              {workspace.runCount > 0 || workspace.agentCount > 0
                ? "Healthy"
                : "Setup"}
            </span>
          </div>
        </div>
      </Link>
    </li>
  );
}

function PersonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 13.5c.8-2.4 2.4-3.5 5-3.5s4.2 1.1 5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="2"
        y="3.5"
        width="12"
        height="10.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M2 7h12M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M9 1.5 4 9h3.5L7 14.5 13 6.5H9.2L9 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CubeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5 13.5 4.5v7L8 14.5 2.5 11.5v-7L8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M8 14.5V8M2.5 4.5 8 8l5.5-3.5" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 5.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" />
    </svg>
  );
}
