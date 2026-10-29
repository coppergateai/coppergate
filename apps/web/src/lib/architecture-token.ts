import { getInstallationForWorkspace, type Database } from "@coppergate/db";
import { resolveInstallationToken } from "./github-app";

/**
 * Best-effort GitHub token for Open Program markdown fetches.
 * Prefers the workspace GitHub App installation; returns null when unset.
 */
export async function resolveArchitectureToken(
  db: Database,
  workspaceId: string,
): Promise<string | null> {
  try {
    const installation = await getInstallationForWorkspace(db, workspaceId);
    if (!installation || installation.status !== "active") return null;
    return await resolveInstallationToken(db, installation);
  } catch {
    return null;
  }
}
