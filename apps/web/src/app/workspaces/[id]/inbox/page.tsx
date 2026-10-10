import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getWorkspaceForMember,
  listPendingApprovalsForWorkspace,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type PageProps = { params: Promise<{ id: string }> };

export default async function WorkspaceInboxPage({ params }: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const pending = await listPendingApprovalsForWorkspace(db, id);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <p style={{ margin: 0 }}>
        <Link href={`/workspaces/${id}/projects`} style={{ color: "#A3A3A3" }}>
          ← Projects
        </Link>
        {" · "}
        <Link href={`/workspaces/${id}/settings`} style={{ color: "#A3A3A3" }}>
          Settings
        </Link>
      </p>
      <h1
        style={{
          margin: "1.25rem 0 0.35rem",
          fontSize: "1.75rem",
          fontWeight: 600,
        }}
      >
        Review inbox
      </h1>
      <p style={{ margin: 0, color: "#A3A3A3" }}>
        Pending approvals for {access.workspace.name}
      </p>

      <section style={{ marginTop: "2rem" }}>
        {pending.length === 0 ? (
          <p style={{ color: "#737373" }}>No pending approvals.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {pending.map((a) => {
              const href =
                a.targetType === "brief" || a.targetType === "task"
                  ? `/workspaces/${id}/projects/${a.projectId}`
                  : `/workspaces/${id}/projects/${a.projectId}`;
              return (
                <li
                  key={a.id}
                  style={{
                    padding: "0.85rem 0",
                    borderBottom: "1px solid #262626",
                  }}
                >
                  <Link
                    href={href}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    <div style={{ fontWeight: 500 }}>
                      {a.targetType} · {a.riskSummary || a.targetId.slice(0, 8)}
                    </div>
                    <div
                      style={{
                        color: "#737373",
                        fontSize: "0.875rem",
                        marginTop: 4,
                      }}
                    >
                      pending · requested {a.createdAt.toISOString()}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
