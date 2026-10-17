import Link from "next/link";
import { EmptyState, Button } from "@/components/app";

export default function WorkspacesNotFound() {
  return (
    <div style={{ padding: "2rem 1.15rem", maxWidth: "32rem" }}>
      <EmptyState
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
