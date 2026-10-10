CREATE TABLE IF NOT EXISTS "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"agent_profile_key" text DEFAULT 'engineer' NOT NULL,
	"base_sha" text NOT NULL DEFAULT 'unknown',
	"head_sha" text,
	"branch_name" text,
	"pr_number" integer,
	"pr_url" text,
	"tool_allowlist" text DEFAULT '[]' NOT NULL,
	"spend_cap_micros" bigint DEFAULT 0 NOT NULL,
	"estimated_cost_micros" bigint DEFAULT 0 NOT NULL,
	"actual_cost_micros" bigint DEFAULT 0 NOT NULL,
	"sandbox_id" text,
	"idempotency_key" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"cancel_requested_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_runs_task_idempotency_unique" UNIQUE("task_id","idempotency_key")
);

ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "agent_runs_claimable_idx"
	ON "agent_runs" ("status","lease_until","created_at");

CREATE INDEX IF NOT EXISTS "agent_runs_task_id_idx" ON "agent_runs" ("task_id");
