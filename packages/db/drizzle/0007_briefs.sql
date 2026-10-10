CREATE TABLE IF NOT EXISTS "product_briefs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"target_user" text NOT NULL DEFAULT '',
	"problem" text NOT NULL DEFAULT '',
	"scope" text NOT NULL DEFAULT '',
	"non_goals" text NOT NULL DEFAULT '',
	"acceptance_criteria" text NOT NULL DEFAULT '[]',
	"raw_idea" text NOT NULL,
	"clarifying_answers" text NOT NULL DEFAULT '[]',
	"created_by" text NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_briefs_project_revision_unique" UNIQUE("project_id","revision")
);

ALTER TABLE "product_briefs" ADD CONSTRAINT "product_briefs_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "product_briefs" ADD CONSTRAINT "product_briefs_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "product_briefs_project_id_idx" ON "product_briefs" ("project_id");
CREATE INDEX IF NOT EXISTS "product_briefs_workspace_id_idx" ON "product_briefs" ("workspace_id");

CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"ip" text,
	"meta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "audit_events_workspace_created_idx"
	ON "audit_events" ("workspace_id","created_at");

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "current_brief_id" uuid;

ALTER TABLE "projects" ADD CONSTRAINT "projects_current_brief_id_product_briefs_id_fk"
	FOREIGN KEY ("current_brief_id") REFERENCES "public"."product_briefs"("id") ON DELETE set null ON UPDATE no action;
