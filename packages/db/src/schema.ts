import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Baseline meta — TASK001.
 */
export const schemaMeta = pgTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** GitHub-authenticated users — TASK003. */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  githubUserId: text("github_user_id").notNull().unique(),
  login: text("login").notNull(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Server-side sessions — opaque token hash in cookie. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

/** Tenant workspace — TASK004. */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** L0 | L1 | L2 */
  autonomyDefault: text("autonomy_default").notNull().default("L0"),
  /** active | suspended | deleted */
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Workspace membership — TASK004. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** owner | member */
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_workspace_user_uidx").on(t.workspaceId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

/** GitHub App installation bound to a workspace — TASK005. */
export const githubInstallations = pgTable("github_installations", {
  id: uuid("id").primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" })
    .unique(),
  githubInstallationId: text("github_installation_id").notNull().unique(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type"),
  /** active | suspended | removed */
  status: text("status").notNull().default("active"),
  /** AES-GCM sealed installation token (short-lived cache). */
  encryptedToken: text("encrypted_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Selected repos under an installation — TASK005. project_id bound in TASK007. */
export const repositoryConnections = pgTable(
  "repository_connections",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    installationId: uuid("installation_id")
      .notNull()
      .references(() => githubInstallations.id, { onDelete: "cascade" }),
    githubRepoId: text("github_repo_id").notNull(),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    defaultBranch: text("default_branch").notNull(),
    baseRepoFullName: text("base_repo_full_name").notNull(),
    /** active | suspended | removed */
    installationStatus: text("installation_status").notNull().default("active"),
    /** JSON string for compatibility checks */
    compatibility: text("compatibility"),
    projectId: uuid("project_id").unique(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("repository_connections_workspace_repo_uidx").on(
      t.workspaceId,
      t.githubRepoId,
    ),
    index("repository_connections_workspace_id_idx").on(t.workspaceId),
  ],
);

/** Public early-access waitlist — discovery landing. */
export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source").notNull().default("landing"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type RepositoryConnection = typeof repositoryConnections.$inferSelect;
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;

export type AutonomyLevel = "L0" | "L1" | "L2";
export type WorkspaceStatus = "active" | "suspended" | "deleted";
export type MembershipRole = "owner" | "member";
export type InstallationStatus = "active" | "suspended" | "removed";
