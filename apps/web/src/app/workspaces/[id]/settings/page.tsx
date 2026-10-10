import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getInstallationForWorkspace,
  getProjectSpendSummary,
  getWorkspaceForMember,
  listProjectsForWorkspace,
  listRepositoryConnections,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DangerZone } from "./danger-zone";
import { GithubPanel } from "./github-panel";
import {
  ProjectsBudgetPanel,
  type ProjectBudgetRow,
} from "./projects-budget-panel";
import { WorkspaceSettingsForm } from "./settings-form";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceSettingsPage({
  params,
  searchParams,
}: PageProps) {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const { id } = await params;
  const access = await getWorkspaceForMember(db, id, user.id);
  if (!access) {
    notFound();
  }

  const { workspace, role } = access;
  const query = await searchParams;
  const githubFlag = typeof query.github === "string" ? query.github : undefined;
  const initialQuery = githubFlag ? `github=${githubFlag}` : undefined;

  // Warm path for SSR consistency (panel still refetches client-side).
  await getInstallationForWorkspace(db, workspace.id);
  await listRepositoryConnections(db, workspace.id);

  const projectRows = await listProjectsForWorkspace(db, workspace.id);
  const budgetRows: ProjectBudgetRow[] = await Promise.all(
    projectRows.map(async ({ project, repository }) => {
      const usage = await getProjectSpendSummary(
        db,
        workspace.id,
        project.id,
      );
      return {
        projectId: project.id,
        name: project.name,
        repoFullName: repository.baseRepoFullName,
        capMicros: usage.capMicros,
        spentMicros: usage.spentMicros,
        reservedMicros: usage.reservedMicros,
        availableMicros: usage.availableMicros,
        currency: usage.currency,
        budgetStatus: usage.budgetStatus,
      };
    }),
  );

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
      <p style={{ margin: 0 }}>
        <Link href="/workspaces" style={{ color: "#A3A3A3" }}>
          ← Workspaces
        </Link>
      </p>
      <h1 style={{ margin: "1.25rem 0 0.35rem", fontSize: "1.75rem", fontWeight: 600 }}>
        {workspace.name}
      </h1>
      <p style={{ margin: 0, color: "#A3A3A3" }}>
        Settings · /{workspace.slug} · you are {role} ·{" "}
        <Link href={`/workspaces/${workspace.id}/projects`} style={{ color: "#A3A3A3" }}>
          Projects
        </Link>
      </p>

      <section style={{ marginTop: "2rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Workspace & autonomy
        </h2>
        {role === "owner" ? (
          <WorkspaceSettingsForm
            workspaceId={workspace.id}
            initialName={workspace.name}
            initialAutonomy={workspace.autonomyDefault}
          />
        ) : (
          <dl style={{ margin: 0, display: "grid", gap: "1rem", color: "#E5E5E5" }}>
            <div>
              <dt style={{ color: "#737373", fontSize: "0.875rem" }}>Name</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{workspace.name}</dd>
            </div>
            <div>
              <dt style={{ color: "#737373", fontSize: "0.875rem" }}>Autonomy default</dt>
              <dd style={{ margin: "0.25rem 0 0" }}>{workspace.autonomyDefault}</dd>
            </div>
            <p style={{ color: "#737373", fontSize: "0.875rem" }}>
              Only owners can change settings.
            </p>
          </dl>
        )}
      </section>

      <ProjectsBudgetPanel
        workspaceId={workspace.id}
        isOwner={role === "owner"}
        initialProjects={budgetRows}
      />

      <GithubPanel
        workspaceId={workspace.id}
        canManage={role === "owner"}
        initialQuery={initialQuery}
      />

      <DangerZone
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        isOwner={role === "owner"}
      />
    </main>
  );
}
