import Link from "next/link";
import { redirect } from "next/navigation";
import { listWorkspacesForUser } from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { CreateWorkspaceForm } from "./create-workspace-form";

export default async function WorkspacesPage() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const rows = await listWorkspacesForUser(db, user.id);
  const inviteRequired = env.PILOT_INVITE_REQUIRED;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <p style={{ margin: 0 }}>
        <Link href="/" style={{ color: "#A3A3A3" }}>
          ← Coppergate
        </Link>
        {" · "}
        <Link href="/docs" style={{ color: "#A3A3A3" }}>
          Docs
        </Link>
      </p>
      <h1 style={{ margin: "1.25rem 0 0.5rem", fontSize: "1.75rem", fontWeight: 600 }}>
        Workspaces
      </h1>
      <p style={{ margin: 0, color: "#A3A3A3" }}>
        Create a workspace to own projects and GitHub connections.
      </p>

      {rows.length === 0 ? (
        <OnboardingGuide
          title="First run"
          steps={[
            {
              id: "invite",
              title: inviteRequired ? "Enter your pilot invite" : "Create a workspace",
              detail: inviteRequired
                ? "Public beta is invite-only. Use the code from your welcome email."
                : "Name your workspace — you’ll connect GitHub next.",
              done: false,
            },
            {
              id: "github",
              title: "Connect GitHub App",
              detail: "Install on a throwaway or low-risk repo in Settings.",
              done: false,
            },
            {
              id: "project",
              title: "Create a project + set budget",
              detail: "Bind one repo, raise the spend cap, set autonomy ≥ L1.",
              done: false,
            },
            {
              id: "brief",
              title: "Approve brief → plan → first task",
              detail: "Submit and approve a small scoped task to queue a run.",
              done: false,
            },
          ]}
        />
      ) : null}

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Your workspaces
        </h2>
        {rows.length === 0 ? (
          <p style={{ color: "#737373" }}>
            No workspaces yet — create one below to start.
          </p>
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
        <CreateWorkspaceForm inviteRequired={inviteRequired} />
      </section>
    </main>
  );
}
