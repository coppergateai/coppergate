import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
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
export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    /** L0 | L1 | L2 */
    autonomyDefault: text("autonomy_default").notNull().default("L0"),
    /** active | suspended | deleted */
    status: text("status").notNull().default("active"),
    /** Set when status becomes deleted — retention / purge clock (TASK028). */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("workspaces_deleted_at_idx").on(t.deletedAt)],
);

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

/** Product project — TASK007. current_brief_id set in TASK008. */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** new_product | existing_repo */
    mode: text("mode").notNull(),
    /** draft | active | archived */
    status: text("status").notNull().default("draft"),
    /** MVP: nextjs_ts only */
    stack: text("stack").notNull().default("nextjs_ts"),
    autonomyLevel: text("autonomy_level").notNull().default("L0"),
    maxBudgetMicros: bigint("max_budget_micros", { mode: "number" })
      .notNull()
      .default(0),
    spentMicros: bigint("spent_micros", { mode: "number" })
      .notNull()
      .default(0),
    /** Pointer to approved brief revision — TASK008 */
    currentBriefId: uuid("current_brief_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("projects_workspace_id_idx").on(t.workspaceId)],
);

/** Immutable brief revisions — TASK008. */
export const productBriefs = pgTable(
  "product_briefs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    /** draft | approved | superseded */
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    targetUser: text("target_user").notNull().default(""),
    problem: text("problem").notNull().default(""),
    scope: text("scope").notNull().default(""),
    nonGoals: text("non_goals").notNull().default(""),
    /** JSON string[] */
    acceptanceCriteria: text("acceptance_criteria").notNull().default("[]"),
    rawIdea: text("raw_idea").notNull(),
    /** JSON ≤3 Q&A */
    clarifyingAnswers: text("clarifying_answers").notNull().default("[]"),
    createdBy: text("created_by").notNull(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("product_briefs_project_revision_uidx").on(
      t.projectId,
      t.revision,
    ),
    index("product_briefs_project_id_idx").on(t.projectId),
    index("product_briefs_workspace_id_idx").on(t.workspaceId),
  ],
);

/** Audit log — TASK008 minimum surface. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ip: text("ip"),
    meta: text("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

/** Milestone in a plan tied to a brief revision — TASK009. */
export const milestones = pgTable(
  "milestones",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => productBriefs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    sequence: integer("sequence").notNull(),
    /** draft | approved | active | done | cancelled */
    status: text("status").notNull().default("draft"),
    estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("milestones_project_id_idx").on(t.projectId),
    index("milestones_brief_id_idx").on(t.briefId),
  ],
);

/** Delivery task — TASK009 (state machine enforcement in TASK010). */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    milestoneId: uuid("milestone_id")
      .notNull()
      .references(() => milestones.id, { onDelete: "cascade" }),
    briefId: uuid("brief_id")
      .notNull()
      .references(() => productBriefs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    goal: text("goal").notNull().default(""),
    scope: text("scope").notNull().default(""),
    /** JSON string[] */
    allowedPaths: text("allowed_paths").notNull().default("[]"),
    /** JSON string[] */
    acceptanceCriteria: text("acceptance_criteria").notNull().default("[]"),
    estimateMicros: bigint("estimate_micros", { mode: "number" }),
    /** S | M | L */
    estimateComplexity: text("estimate_complexity"),
    /** DRAFT | READY_FOR_APPROVAL | … (see DATA_MODEL §4) */
    status: text("status").notNull().default("DRAFT"),
    baseSha: text("base_sha"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    prUrl: text("pr_url"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tasks_project_id_idx").on(t.projectId),
    index("tasks_milestone_id_idx").on(t.milestoneId),
  ],
);

/** Survivor arena per project — TASK048 / ARENA.md. */
export const arenas = pgTable(
  "arenas",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    minHuman: boolean("min_human").notNull().default(false),
    prodWritesEnabled: boolean("prod_writes_enabled").notNull().default(false),
    defaultContenderN: integer("default_contender_n").notNull().default(2),
    /** ARMED | RUNNING | KILLED | PAUSED */
    status: text("status").notNull().default("ARMED"),
    killedAt: timestamp("killed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("arenas_project_id_uidx").on(t.projectId),
    index("arenas_workspace_id_idx").on(t.workspaceId),
  ],
);

/** Contender in an arena pool — TASK048. */
export const contenders = pgTable(
  "contenders",
  {
    id: uuid("id").primaryKey(),
    arenaId: uuid("arena_id")
      .notNull()
      .references(() => arenas.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    profileKey: text("profile_key").notNull().default("engineer"),
    budgetMicrosRemaining: bigint("budget_micros_remaining", { mode: "number" })
      .notNull()
      .default(0),
    /** ACTIVE | ELIMINATED */
    status: text("status").notNull().default("ACTIVE"),
    eliminatedAt: timestamp("eliminated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("contenders_arena_id_idx").on(t.arenaId),
    index("contenders_workspace_id_idx").on(t.workspaceId),
  ],
);

/** Tournament round for a task — TASK048. */
export const tournaments = pgTable(
  "tournaments",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    arenaId: uuid("arena_id")
      .notNull()
      .references(() => arenas.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    n: integer("n").notNull().default(2),
    winnerRunId: uuid("winner_run_id"),
    /** OPEN | SCORING | RESOLVED | CANCELLED */
    status: text("status").notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("tournaments_task_id_idx").on(t.taskId),
    index("tournaments_arena_id_idx").on(t.arenaId),
    index("tournaments_workspace_id_idx").on(t.workspaceId),
  ],
);

/** Agent execution jobs — TASK013 queue + lease · TASK048 tournament fields. */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** QUEUED | RUNNING | VALIDATING | … */
    status: text("status").notNull().default("QUEUED"),
    attempt: integer("attempt").notNull().default(1),
    agentProfileKey: text("agent_profile_key").notNull().default("engineer"),
    baseSha: text("base_sha").notNull().default("unknown"),
    headSha: text("head_sha"),
    branchName: text("branch_name"),
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    toolAllowlist: text("tool_allowlist").notNull().default("[]"),
    spendCapMicros: bigint("spend_cap_micros", { mode: "number" })
      .notNull()
      .default(0),
    estimatedCostMicros: bigint("estimated_cost_micros", { mode: "number" })
      .notNull()
      .default(0),
    actualCostMicros: bigint("actual_cost_micros", { mode: "number" })
      .notNull()
      .default(0),
    sandboxId: text("sandbox_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    tournamentId: uuid("tournament_id").references(() => tournaments.id, {
      onDelete: "set null",
    }),
    contenderId: uuid("contender_id").references(() => contenders.id, {
      onDelete: "set null",
    }),
    fitnessScore: doublePrecision("fitness_score"),
    fitnessEvidenceRef: text("fitness_evidence_ref"),
    /** WINNER | LOSER | CANCELLED */
    tournamentResult: text("tournament_result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_runs_task_idempotency_uidx").on(
      t.taskId,
      t.idempotencyKey,
    ),
    index("agent_runs_claimable_idx").on(t.status, t.leaseUntil, t.createdAt),
    index("agent_runs_task_id_idx").on(t.taskId),
    index("agent_runs_tournament_id_idx").on(t.tournamentId),
    index("agent_runs_contender_id_idx").on(t.contenderId),
  ],
);

/** Durable artifacts (validation reports, etc.) — TASK016. */
export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, {
      onDelete: "cascade",
    }),
    /** brief | plan | diff_summary | log | validation_report | delivery_report */
    kind: text("kind").notNull(),
    contentType: text("content_type").notNull().default("application/json"),
    /** Inline MVP storage key (no object store yet). */
    storageKey: text("storage_key").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    /** JSON meta: pass/fail, summary, etc. */
    meta: text("meta").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("artifacts_run_id_idx").on(t.runId),
    index("artifacts_task_id_idx").on(t.taskId),
    index("artifacts_project_kind_idx").on(t.projectId, t.kind),
  ],
);

/** Append-only run activity stream — TASK014 persistence / TASK015 API. */
export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid("id").primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    /** status | log | tool | file | cost | error | evidence | progress | completion */
    kind: text("kind").notNull(),
    payload: text("payload").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("agent_run_events_run_seq_uidx").on(t.runId, t.seq),
    index("agent_run_events_run_seq_idx").on(t.runId, t.seq),
  ],
);

/** Project/workspace spend caps — TASK012. */
export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** null = workspace-level budget */
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    capMicros: bigint("cap_micros", { mode: "number" }).notNull(),
    softAlertMicros: bigint("soft_alert_micros", { mode: "number" }),
    currency: text("currency").notNull().default("USD"),
    /** active | paused */
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("budgets_workspace_id_idx").on(t.workspaceId)],
);

/** Immutable usage ledger — TASK012. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    runId: uuid("run_id"),
    /** llm_tokens | sandbox_seconds | estimate_reserve | estimate_release | adjustment */
    kind: text("kind").notNull(),
    quantity: text("quantity").notNull().default("0"),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    provider: text("provider"),
    model: text("model"),
    meta: text("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("usage_events_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

/** Human approval gates — TASK011. */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** brief | milestone | task | run_review | merge */
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** pending | approved | rejected | changes_requested | expired */
    status: text("status").notNull().default("pending"),
    riskSummary: text("risk_summary"),
    /** JSON uuid[] */
    evidenceArtifactIds: text("evidence_artifact_ids").notNull().default("[]"),
    requestedBy: text("requested_by").notNull(),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("approvals_workspace_status_idx").on(t.workspaceId, t.status),
    index("approvals_project_id_idx").on(t.projectId),
  ],
);

/** Append-only task status history — TASK010. */
export const taskStatusTransitions = pgTable(
  "task_status_transitions",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    fromStatus: text("from_status").notNull(),
    toStatus: text("to_status").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_status_transitions_task_id_idx").on(t.taskId, t.createdAt),
  ],
);

/** Directed edge predecessor → successor — TASK009. */
export const taskDependencies = pgTable(
  "task_dependencies",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    predecessorTaskId: uuid("predecessor_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    successorTaskId: uuid("successor_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("task_dependencies_pair_uidx").on(
      t.predecessorTaskId,
      t.successorTaskId,
    ),
    index("task_deps_successor_idx").on(t.successorTaskId),
  ],
);

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
    projectId: uuid("project_id")
      .unique()
      .references(() => projects.id, { onDelete: "set null" }),
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

/** Pilot invite codes — TASK035 public beta gating. */
export const pilotInvites = pgTable(
  "pilot_invites",
  {
    id: uuid("id").primaryKey(),
    code: text("code").notNull().unique(),
    note: text("note"),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    redeemedByUserId: uuid("redeemed_by_user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("pilot_invites_code_idx").on(t.code)],
);

/** Idempotent GitHub webhook delivery log — TASK006. */
export const githubWebhookDeliveries = pgTable(
  "github_webhook_deliveries",
  {
    id: uuid("id").primaryKey(),
    deliveryId: text("delivery_id").notNull().unique(),
    event: text("event").notNull(),
    action: text("action"),
    githubInstallationId: text("github_installation_id"),
    /** Raw JSON body (trusted only after signature verify). */
    payload: text("payload").notNull(),
    /** processed | duplicate | ignored | failed */
    status: text("status").notNull().default("processed"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("github_webhook_deliveries_event_idx").on(t.event),
    index("github_webhook_deliveries_received_at_idx").on(t.receivedAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type GithubInstallation = typeof githubInstallations.$inferSelect;
export type RepositoryConnection = typeof repositoryConnections.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type ProductBrief = typeof productBriefs.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskDependency = typeof taskDependencies.$inferSelect;
export type TaskStatusTransition = typeof taskStatusTransitions.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
export type Arena = typeof arenas.$inferSelect;
export type Contender = typeof contenders.$inferSelect;
export type Tournament = typeof tournaments.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type AgentRunEvent = typeof agentRunEvents.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;
export type PilotInvite = typeof pilotInvites.$inferSelect;
export type GithubWebhookDelivery = typeof githubWebhookDeliveries.$inferSelect;

export type ArenaStatus = "ARMED" | "RUNNING" | "KILLED" | "PAUSED";
export type ContenderStatus = "ACTIVE" | "ELIMINATED";
export type TournamentStatus = "OPEN" | "SCORING" | "RESOLVED" | "CANCELLED";
export type TournamentResult = "WINNER" | "LOSER" | "CANCELLED";

export type AutonomyLevel = "L0" | "L1" | "L2";
export type WorkspaceStatus = "active" | "suspended" | "deleted";
export type MembershipRole = "owner" | "member";
export type InstallationStatus = "active" | "suspended" | "removed";
export type ProjectMode = "new_product" | "existing_repo";
export type ProjectStatus = "draft" | "active" | "archived";
export type ProjectStack = "nextjs_ts";
export type BriefStatus = "draft" | "approved" | "superseded";
export type MilestoneStatus =
  | "draft"
  | "approved"
  | "active"
  | "done"
  | "cancelled";
export type EstimateComplexity = "S" | "M" | "L";
export type ApprovalTargetType =
  | "brief"
  | "milestone"
  | "task"
  | "run_review"
  | "merge";
export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "expired";
export type BudgetStatus = "active" | "paused";
export type UsageKind =
  | "llm_tokens"
  | "sandbox_seconds"
  | "estimate_reserve"
  | "estimate_release"
  | "adjustment";
