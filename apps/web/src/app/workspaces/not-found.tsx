import Link from "next/link";
import { EmptyState, Button } from "@/components/app";
import styles from "./status.module.css";

export default function WorkspacesNotFound() {
  return (
    <div className={styles.emptyWrap}>
      <EmptyState
        className={styles.emptyCard}
        title="Workspace or page not found"
        body="This path isn’t in your account — or the gate isn’t open for it yet."
        action={
          <Link href="/workspaces">
            <Button variant="primary">Back to workspaces</Button>
          </Link>
        }
      />
    </div>
  );
}
