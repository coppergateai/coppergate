import { Suspense } from "react";
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
import { AnalyticsPanel } from "./analytics-panel";
import { ByokPanel } from "./byok-panel";
import { DangerZone } from "./danger-zone";
import { GithubPanel } from "./github-panel";
import { GitlabPanel } from "./gitlab-panel";
import { NotifyPanel } from "./notify-panel";
import {
  ProjectsBudgetPanel,
  type ProjectBudgetRow,
} from "./projects-budget-panel";
import { SettingsShell } from "./settings-shell";
import { SignalsPanel } from "./signals-panel";
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
  const gitlabFlag = typeof query.gitlab === "string" ? query.gitlab : undefined;
  const tabParam = typeof query.tab === "string" ? query.tab : undefined;
  const initialQuery = [
    githubFlag ? `github=${githubFlag}` : null,
    gitlabFlag ? `gitlab=${gitlabFlag}` : null,
  ]
    .filter(Boolean)
    .join("&") || undefined;

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

  const general = (
    <div className={styles.stackWide}>
      <section className={styles.section} aria-labelledby="workspace-heading">
        <h2 id="workspace-heading" className={styles.sectionLabel}>
          Workspace & autonomy
        </h2>
        <p className={styles.sectionLede}>
          Name the workspace and set the default autonomy gate for new arenas.
        </p>
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
    </div>
  );

  const connections = (
    <div className={styles.splitGrid}>
      <GithubPanel
        workspaceId={workspace.id}
        canManage={role === "owner"}
        initialQuery={initialQuery}
      />
      <GitlabPanel
        workspaceId={workspace.id}
        canManage={role === "owner"}
        initialQuery={initialQuery}
      />
    </div>
  );

  const signals = (
    <div className={styles.stackWide}>
      <SignalsPanel workspaceId={workspace.id} isOwner={role === "owner"} />
      <NotifyPanel
        workspaceId={workspace.id}
        isOwner={role === "owner"}
        initialWebhookUrl={workspace.notifyWebhookUrl}
        initialEmailEnabled={workspace.notifyEmailEnabled}
      />
    </div>
  );

  return (
    <main className={styles.main}>
      <Suspense fallback={null}>
        <SettingsShell
          workspaceName={workspace.name}
          workspaceSlug={workspace.slug}
          role={role}
          initialTab={
            tabParam ??
            (githubFlag || gitlabFlag ? "connections" : undefined)
          }
          panels={{
            connections,
            general,
            signals,
            llm: (
              <ByokPanel
                workspaceId={workspace.id}
                isOwner={role === "owner"}
              />
            ),
            analytics: (
              <AnalyticsPanel
                workspaceId={workspace.id}
                isOwner={role === "owner"}
              />
            ),
            danger: (
              <DangerZone
                workspaceId={workspace.id}
                workspaceName={workspace.name}
                isOwner={role === "owner"}
              />
            ),
          }}
        />
      </Suspense>
    </main>
  );
}
