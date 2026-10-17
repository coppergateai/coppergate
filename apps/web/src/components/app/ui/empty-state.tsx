import type { ReactNode } from "react";
import styles from "./ui.module.css";

type Props = {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, body, action, className }: Props) {
  return (
    <div className={[styles.empty, className ?? ""].filter(Boolean).join(" ")}>
      <p className={styles.emptyTitle}>{title}</p>
      {body ? <p className={styles.emptyBody}>{body}</p> : null}
      {action ? <div className={styles.emptyAction}>{action}</div> : null}
    </div>
  );
}
