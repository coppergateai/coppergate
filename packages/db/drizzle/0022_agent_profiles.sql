-- D13 bounded agent profiles — TASK101

CREATE TABLE IF NOT EXISTS "agent_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid,
	"key" text NOT NULL,
	"display_name" text NOT NULL,
	"prompt_guidance" text DEFAULT '' NOT NULL,
	"tool_allowlist_json" text DEFAULT '[]' NOT NULL,
	"strategy_default" text DEFAULT 'balanced' NOT NULL,
	"max_spend_micros" bigint DEFAULT 100000 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_profiles_ws_key_uidx"
	ON "agent_profiles" ("workspace_id", "key");
CREATE INDEX IF NOT EXISTS "agent_profiles_key_idx"
	ON "agent_profiles" ("key");

-- System seed rows (workspace_id NULL). Partial unique for null workspace.
CREATE UNIQUE INDEX IF NOT EXISTS "agent_profiles_system_key_uidx"
	ON "agent_profiles" ("key") WHERE "workspace_id" IS NULL;
