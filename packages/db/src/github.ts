import { and, eq, ne } from "drizzle-orm";
import type { Database } from "./client.js";
import {
  githubInstallations,
  repositoryConnections,
  type GithubInstallation,
  type InstallationStatus,
  type RepositoryConnection,
} from "./schema.js";

export type UpsertInstallationInput = {
  workspaceId: string;
  /** github | gitlab — default github */
  provider?: "github" | "gitlab";
  githubInstallationId: string;
  accountLogin: string;
  accountType?: string | null;
  encryptedToken?: string | null;
  tokenExpiresAt?: Date | null;
  status?: InstallationStatus;
};

export async function upsertGithubInstallation(
  db: Database,
  input: UpsertInstallationInput,
): Promise<GithubInstallation> {
  const now = new Date();
  const id = crypto.randomUUID();
  const status = input.status ?? "active";
  const provider = input.provider ?? "github";

  const [row] = await db
    .insert(githubInstallations)
    .values({
      id,
      workspaceId: input.workspaceId,
      provider,
      githubInstallationId: input.githubInstallationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType ?? null,
      status,
      encryptedToken: input.encryptedToken ?? null,
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: githubInstallations.workspaceId,
      set: {
        provider,
        githubInstallationId: input.githubInstallationId,
        accountLogin: input.accountLogin,
        accountType: input.accountType ?? null,
        status,
        encryptedToken: input.encryptedToken ?? null,
        tokenExpiresAt: input.tokenExpiresAt ?? null,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("Failed to upsert SCM installation");
  return row;
}

/** Alias for multi-SCM call sites. */
export const upsertScmInstallation = upsertGithubInstallation;

export async function getInstallationForWorkspace(
  db: Database,
  workspaceId: string,
): Promise<GithubInstallation | undefined> {
  const [row] = await db
    .select()
    .from(githubInstallations)
    .where(
      and(
        eq(githubInstallations.workspaceId, workspaceId),
        ne(githubInstallations.status, "removed"),
      ),
    )
    .limit(1);
  return row;
}

export async function getInstallationById(
  db: Database,
  installationId: string,
): Promise<GithubInstallation | undefined> {
  const [row] = await db
    .select()
    .from(githubInstallations)
    .where(eq(githubInstallations.id, installationId))
    .limit(1);
  return row;
}

export async function updateInstallationToken(
  db: Database,
  installationId: string,
  encryptedToken: string,
  tokenExpiresAt: Date,
): Promise<void> {
  await db
    .update(githubInstallations)
    .set({
      encryptedToken,
      tokenExpiresAt,
      updatedAt: new Date(),
    })
    .where(eq(githubInstallations.id, installationId));
}

export async function markInstallationRemoved(
  db: Database,
  workspaceId: string,
): Promise<GithubInstallation | undefined> {
  const now = new Date();
  const [row] = await db
    .update(githubInstallations)
    .set({
      status: "removed",
      encryptedToken: null,
      tokenExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(githubInstallations.workspaceId, workspaceId))
    .returning();

  if (row) {
    await db
      .update(repositoryConnections)
      .set({ installationStatus: "removed", updatedAt: now })
      .where(eq(repositoryConnections.workspaceId, workspaceId));
  }
  return row;
}

export type ConnectRepoInput = {
  workspaceId: string;
  installationId: string;
  /** github | gitlab — default github */
  provider?: "github" | "gitlab";
  githubRepoId: string;
  owner: string;
  name: string;
  defaultBranch: string;
  baseRepoFullName: string;
  compatibility?: string | null;
};

export async function connectRepository(
  db: Database,
  input: ConnectRepoInput,
): Promise<RepositoryConnection> {
  const now = new Date();
  const provider = input.provider ?? "github";
  const [row] = await db
    .insert(repositoryConnections)
    .values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      installationId: input.installationId,
      provider,
      githubRepoId: input.githubRepoId,
      owner: input.owner,
      name: input.name,
      defaultBranch: input.defaultBranch,
      baseRepoFullName: input.baseRepoFullName,
      installationStatus: "active",
      compatibility: input.compatibility ?? null,
      projectId: null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        repositoryConnections.workspaceId,
        repositoryConnections.githubRepoId,
      ],
      set: {
        installationId: input.installationId,
        provider,
        owner: input.owner,
        name: input.name,
        defaultBranch: input.defaultBranch,
        baseRepoFullName: input.baseRepoFullName,
        installationStatus: "active",
        compatibility: input.compatibility ?? null,
        lastSyncedAt: now,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("Failed to connect repository");
  return row;
}

export async function listRepositoryConnections(
  db: Database,
  workspaceId: string,
): Promise<RepositoryConnection[]> {
  return db
    .select()
    .from(repositoryConnections)
    .where(
      and(
        eq(repositoryConnections.workspaceId, workspaceId),
        ne(repositoryConnections.installationStatus, "removed"),
      ),
    );
}

export async function getRepositoryConnectionForWorkspace(
  db: Database,
  workspaceId: string,
  connectionId: string,
): Promise<RepositoryConnection | undefined> {
  const [row] = await db
    .select()
    .from(repositoryConnections)
    .where(
      and(
        eq(repositoryConnections.id, connectionId),
        eq(repositoryConnections.workspaceId, workspaceId),
        ne(repositoryConnections.installationStatus, "removed"),
      ),
    )
    .limit(1);
  return row;
}

export async function revokeRepositoryConnection(
  db: Database,
  workspaceId: string,
  connectionId: string,
): Promise<RepositoryConnection | undefined> {
  const [row] = await db
    .update(repositoryConnections)
    .set({
      installationStatus: "removed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(repositoryConnections.id, connectionId),
        eq(repositoryConnections.workspaceId, workspaceId),
      ),
    )
    .returning();
  return row;
}
