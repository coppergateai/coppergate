CREATE TABLE IF NOT EXISTS "artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid,
	"run_id" uuid,
	"kind" text NOT NULL,
	"content_type" text NOT NULL DEFAULT 'application/json',
	"storage_key" text NOT NULL,
	"checksum_sha256" text NOT NULL,
	"meta" text NOT NULL DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_run_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "artifacts_run_id_idx" ON "artifacts" ("run_id");
CREATE INDEX IF NOT EXISTS "artifacts_task_id_idx" ON "artifacts" ("task_id");
CREATE INDEX IF NOT EXISTS "artifacts_project_kind_idx" ON "artifacts" ("project_id","kind");
