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
import { SiteChrome } from "../../../site-chrome";
import { DangerZone } from "./danger-zone";
import { GithubPanel } from "./github-panel";
import {
  ProjectsBudgetPanel,
  type ProjectBudgetRow,
} from "./projects-budget-panel";
import { WorkspaceSettingsForm } from "./settings-form";
import styles from "./settings.module.css";

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
    <SiteChrome>
      <main className={styles.main}>
        <Link href="/workspaces" className={styles.back}>
          ← Workspaces
        </Link>
        <p className={styles.eyebrow}>Settings</p>
        <h1 className={styles.title}>{workspace.name}</h1>
        <p className={styles.meta}>
          /{workspace.slug} · you are {role} ·{" "}
          <Link
            href={`/workspaces/${workspace.id}/projects`}
            className={styles.metaLink}
          >
            Projects
          </Link>
        </p>

        <section className={styles.section} aria-labelledby="workspace-heading">
          <h2 id="workspace-heading" className={styles.sectionLabel}>
            Workspace & autonomy
          </h2>
          {role === "owner" ? (
            <WorkspaceSettingsForm
              workspaceId={workspace.id}
              initialName={workspace.name}
              initialAutonomy={workspace.autonomyDefault}
            />
          ) : (
            <dl className={styles.readOnly}>
              <div>
                <dt>Name</dt>
                <dd>{workspace.name}</dd>
              </div>
              <div>
                <dt>Autonomy default</dt>
                <dd>{workspace.autonomyDefault}</dd>
              </div>
              <p className={styles.note}>Only owners can change settings.</p>
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
    </SiteChrome>
  );
}
