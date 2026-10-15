-- D13 Signal Adapters — TASK061

CREATE TABLE IF NOT EXISTS "signal_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"repo_hint" text,
	"urls_json" text DEFAULT '[]' NOT NULL,
	"labels_json" text DEFAULT '[]' NOT NULL,
	"raw_ref" text,
	"status" text DEFAULT 'received' NOT NULL,
	"task_id" uuid,
	"tournament_id" uuid,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "signal_events" ADD CONSTRAINT "signal_events_tournament_id_fk"
	FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "signal_events_ws_provider_ext_uidx"
	ON "signal_events" ("workspace_id", "provider", "external_id");
CREATE INDEX IF NOT EXISTS "signal_events_ws_fingerprint_idx"
	ON "signal_events" ("workspace_id", "fingerprint");
CREATE INDEX IF NOT EXISTS "signal_events_workspace_id_idx"
	ON "signal_events" ("workspace_id");
CREATE INDEX IF NOT EXISTS "signal_events_status_idx"
	ON "signal_events" ("status");

CREATE TABLE IF NOT EXISTS "auto_arm_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"provider" text DEFAULT '*' NOT NULL,
	"min_severity" text DEFAULT 'high' NOT NULL,
	"path_allowlist_json" text DEFAULT '[]' NOT NULL,
	"label_match_json" text DEFAULT '[]' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"arm_arena" boolean DEFAULT true NOT NULL,
	"profile_keys_json" text DEFAULT '["fixer"]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "auto_arm_rules" ADD CONSTRAINT "auto_arm_rules_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "auto_arm_rules" ADD CONSTRAINT "auto_arm_rules_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "auto_arm_rules_workspace_id_idx"
	ON "auto_arm_rules" ("workspace_id");
