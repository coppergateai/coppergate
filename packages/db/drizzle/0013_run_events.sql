CREATE TABLE IF NOT EXISTS "agent_run_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"kind" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_run_events_run_seq_unique" UNIQUE("run_id","seq")
);

ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_run_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "agent_run_events" ADD CONSTRAINT "agent_run_events_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "agent_run_events_run_seq_idx"
	ON "agent_run_events" ("run_id","seq");
