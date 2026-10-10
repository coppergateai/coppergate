CREATE TABLE IF NOT EXISTS "task_status_transitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "task_status_transitions" ADD CONSTRAINT "task_status_transitions_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "task_status_transitions" ADD CONSTRAINT "task_status_transitions_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "task_status_transitions_task_id_idx"
	ON "task_status_transitions" ("task_id","created_at");

CREATE INDEX IF NOT EXISTS "tasks_project_status_idx" ON "tasks" ("project_id","status");
