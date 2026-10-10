import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkspacesForUser } from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function WorkspacesPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const rows = await listWorkspacesForUser(db, user.id);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: "#A3A3A3" }}>
          ← Coppergate
        </Link>
      </p>
      <h1 style={{ margin: "1.25rem 0 0.5rem", fontSize: "1.75rem", fontWeight: 600 }}>
        Workspaces
      </h1>
      <p style={{ margin: 0, color: "#A3A3A3" }}>
        Create a workspace to own projects and GitHub connections.
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Your workspaces
        </h2>
        {rows.length === 0 ? (
          <p style={{ color: "#737373" }}>No workspaces yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {rows.map(({ workspace, role }) => (
              <li
                key={workspace.id}
                style={{
                  padding: "0.85rem 0",
                  borderBottom: "1px solid #262626",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  alignItems: "baseline",
                }}
              >
                <div>
                  <Link
                    href={`/workspaces/${workspace.id}/settings`}
                    style={{ color: "#FFFFFF", textDecoration: "none", fontWeight: 500 }}
                  >
                    {workspace.name}
                  </Link>
                  <div style={{ color: "#737373", fontSize: "0.875rem", marginTop: 4 }}>
                    /{workspace.slug} · {role}
                  </div>
                </div>
                <Link
                  href={`/workspaces/${workspace.id}/settings`}
                  style={{ color: "#A3A3A3", fontSize: "0.875rem" }}
                >
                  Settings
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "2.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Create workspace
        </h2>
        <CreateWorkspaceForm />
      </section>
    </main>
  );
}
