import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import {
  getInstallationForWorkspace,
  getProjectSpendSummary,
  getWorkspaceForMember,
  getWorkspaceSpendSummary,
  listProjectsForWorkspace,
  listRepositoryConnections,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BillingPanel } from "./billing-panel";
import { AgentsPanel } from "./agents-panel";
import { ByokPanel } from "./byok-panel";
import { McpPanel } from "./mcp-panel";
import { DangerZone } from "./danger-zone";
import { DemoSeedPanel } from "./demo-seed-panel";
import { NotifyPanel } from "./notify-panel";
import { ScmConnectionsPanel } from "./scm-connections";
import {
  ProjectsBudgetPanel,
  type ProjectBudgetRow,
  type WorkspaceBudgetSummary,
} from "./projects-budget-panel";
import { SettingsShell } from "./settings-shell";
import { SignalsPanel } from "./signals-panel";
import { WorkspaceSettingsForm } from "./settings-form";
import styles from "./settings.module.css";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "Settings" };

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
  if (tabParam === "analytics") {
    redirect(`/workspaces/${workspace.id}/insights`);
  }
  const checkoutFlag =
    typeof query.checkout === "string" ? query.checkout : undefined;
  const initialQuery = [
    githubFlag ? `github=${githubFlag}` : null,
    gitlabFlag ? `gitlab=${gitlabFlag}` : null,
  ]
    .filter(Boolean)
    .join("&") || undefined;

  await getInstallationForWorkspace(db, workspace.id);
  await listRepositoryConnections(db, workspace.id);

  const projectRows = await listProjectsForWorkspace(db, workspace.id);
  const wsSpend = await getWorkspaceSpendSummary(db, workspace.id);
  const workspaceBudget: WorkspaceBudgetSummary = wsSpend
    ? {
        capMicros: wsSpend.capMicros,
        spentMicros: wsSpend.spentMicros,
        reservedMicros: wsSpend.reservedMicros,
        availableMicros: wsSpend.availableMicros,
        currency: wsSpend.currency,
        budgetStatus: wsSpend.budgetStatus,
        period: wsSpend.period,
      }
    : null;
  // Prefer cached project.spentMicros under a workspace pool — avoid N× spend
  // summaries (kprompt has many sibling projects; that was timing out settings).
  const budgetRows: ProjectBudgetRow[] = wsSpend
    ? projectRows.map(({ project, repository }) => ({
        projectId: project.id,
        name: project.name,
        repoFullName: repository.baseRepoFullName,
        projectSpentMicros: project.spentMicros,
        currency: wsSpend.currency,
      }))
    : await Promise.all(
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
            projectSpentMicros: usage.projectSpentMicros ?? usage.spentMicros,
            currency: usage.currency,
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
        initialWorkspace={workspaceBudget}
        initialProjects={budgetRows}
      />
      {process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_DEMO_SEED === "1" ? (
        <DemoSeedPanel
          workspaceId={workspace.id}
          isOwner={role === "owner"}
          projects={projectRows.map(({ project }) => ({
            id: project.id,
            name: project.name,
          }))}
        />
      ) : null}
    </div>
  );

  const preferScm =
    githubFlag != null
      ? ("github" as const)
      : gitlabFlag != null
        ? ("gitlab" as const)
        : null;

  const connections = (
    <ScmConnectionsPanel
      workspaceId={workspace.id}
      canManage={role === "owner"}
      initialQuery={initialQuery}
      prefer={preferScm}
    />
  );

  const signals = (
    <div className={styles.stackWide}>
      <SignalsPanel
        workspaceId={workspace.id}
        isOwner={role === "owner"}
        projects={projectRows.map(({ project }) => ({
          id: project.id,
          name: project.name,
        }))}
      />
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
      <Suspense
        fallback={
          <div style={{ padding: "1.25rem 1.15rem" }} aria-busy="true">
            <p className={styles.note}>Loading settings…</p>
          </div>
        }
      >
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
            billing: (
              <BillingPanel
                workspaceId={workspace.id}
                isOwner={role === "owner"}
                checkoutFlag={checkoutFlag}
              />
            ),
            signals,
            llm: (
              <div className={styles.stackWide}>
                <ByokPanel
                  workspaceId={workspace.id}
                  isOwner={role === "owner"}
                />
                <AgentsPanel
                  workspaceId={workspace.id}
                  isOwner={role === "owner"}
                />
                <McpPanel
                  workspaceId={workspace.id}
                  isOwner={role === "owner"}
                />
              </div>
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
