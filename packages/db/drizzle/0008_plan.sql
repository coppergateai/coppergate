CREATE TABLE IF NOT EXISTS "milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL DEFAULT '',
	"sequence" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"estimated_cost_micros" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "milestones" ADD CONSTRAINT "milestones_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_brief_id_product_briefs_id_fk"
	FOREIGN KEY ("brief_id") REFERENCES "public"."product_briefs"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "milestones_project_id_idx" ON "milestones" ("project_id");
CREATE INDEX IF NOT EXISTS "milestones_brief_id_idx" ON "milestones" ("brief_id");

CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"brief_id" uuid NOT NULL,
	"title" text NOT NULL,
	"goal" text NOT NULL DEFAULT '',
	"scope" text NOT NULL DEFAULT '',
	"allowed_paths" text NOT NULL DEFAULT '[]',
	"acceptance_criteria" text NOT NULL DEFAULT '[]',
	"estimate_micros" bigint,
	"estimate_complexity" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"base_sha" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"pr_url" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk"
	FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_brief_id_product_briefs_id_fk"
	FOREIGN KEY ("brief_id") REFERENCES "public"."product_briefs"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "tasks_project_id_idx" ON "tasks" ("project_id");
CREATE INDEX IF NOT EXISTS "tasks_milestone_id_idx" ON "tasks" ("milestone_id");

CREATE TABLE IF NOT EXISTS "task_dependencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"predecessor_task_id" uuid NOT NULL,
	"successor_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_pair_unique" UNIQUE("predecessor_task_id","successor_task_id")
);

ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_deps_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_deps_pred_tasks_id_fk"
	FOREIGN KEY ("predecessor_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_deps_succ_tasks_id_fk"
	FOREIGN KEY ("successor_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "task_deps_successor_idx" ON "task_dependencies" ("successor_task_id");
