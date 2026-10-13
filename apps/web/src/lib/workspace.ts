import {
  getWorkspaceForMember,
  type MembershipRole,
  type WorkspaceWithRole,
  type Database,
} from "@coppergate/db";
import { ApiError } from "@coppergate/errors";

export async function requireWorkspaceMember(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceWithRole> {
  const access = await getWorkspaceForMember(db, workspaceId, userId);
  if (!access) {
    // Fail closed without leaking existence to non-members.
    throw new ApiError("not_found", "Workspace not found");
  }
  return access;
}

export async function requireWorkspaceOwner(
  db: Database,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceWithRole> {
  const access = await requireWorkspaceMember(db, workspaceId, userId);
  if (access.role !== "owner") {
    throw new ApiError("forbidden", "Owner role required");
  }
  return access;
}

export function serializeWorkspace(access: WorkspaceWithRole) {
  const { workspace, role } = access;
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    autonomyDefault: workspace.autonomyDefault,
    notifyWebhookUrl: workspace.notifyWebhookUrl,
    notifyEmailEnabled: workspace.notifyEmailEnabled,
    status: workspace.status,
    role: role as MembershipRole,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}
