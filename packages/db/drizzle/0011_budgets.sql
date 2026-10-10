CREATE TABLE IF NOT EXISTS "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"cap_micros" bigint NOT NULL,
	"soft_alert_micros" bigint,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_project_id_uidx"
	ON "budgets" ("project_id")
	WHERE "project_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "budgets_workspace_id_idx" ON "budgets" ("workspace_id");

CREATE TABLE IF NOT EXISTS "usage_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"run_id" uuid,
	"kind" text NOT NULL,
	"quantity" text DEFAULT '0' NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"provider" text,
	"model" text,
	"meta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "usage_events_project_created_idx"
	ON "usage_events" ("project_id","created_at");
