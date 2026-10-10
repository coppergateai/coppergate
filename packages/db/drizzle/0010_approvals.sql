CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"risk_summary" text,
	"evidence_artifact_ids" text DEFAULT '[]' NOT NULL,
	"requested_by" text NOT NULL,
	"decided_by" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "approvals_workspace_status_idx"
	ON "approvals" ("workspace_id","status");

CREATE INDEX IF NOT EXISTS "approvals_project_id_idx"
	ON "approvals" ("project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "approvals_pending_target_uidx"
	ON "approvals" ("target_type","target_id")
	WHERE "status" = 'pending';
