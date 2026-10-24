import {
  listWorkspacesForUserWithStats,
  workspaceListBlurb,
} from "@coppergate/db";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppChrome } from "@/components/app";
import { WorkspacesHome } from "./workspaces-home";
import type { WorkspaceCardData } from "./workspace-card";

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function WorkspacesPage() {
  const user = await currentUser();
  if (!user) {
    return null;
  }

  const rows = await listWorkspacesForUserWithStats(db, user.id);
  const inviteRequired = env.PILOT_INVITE_REQUIRED;

  const workspaces = rows.map(({ workspace, role }) => ({
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
  }));

  const cards: WorkspaceCardData[] = rows.map(
    ({
      workspace,
      role,
      projectCount,
      agentCount,
      runCount,
      memberCount,
    }) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role,
      status: workspace.status,
      blurb: workspaceListBlurb(workspace.slug),
      updatedAt: formatDate(workspace.updatedAt),
      updatedAtIso: workspace.updatedAt.toISOString(),
      projectCount,
      agentCount,
      runCount,
      memberCount,
    }),
  );

  const sidebarUser = {
    login: user.login,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };

  return (
    <AppChrome workspaces={workspaces} user={sidebarUser}>
      <WorkspacesHome workspaces={cards} inviteRequired={inviteRequired} />
    </AppChrome>
  );
}
