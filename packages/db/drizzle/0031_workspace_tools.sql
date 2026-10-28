-- Workspace tool catalog definitions (allowlist membership + metadata).

CREATE TABLE IF NOT EXISTS "workspace_tool_defs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'custom' NOT NULL,
	"target_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "workspace_tool_defs" ADD CONSTRAINT "workspace_tool_defs_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "workspace_tool_defs_ws_idx"
	ON "workspace_tool_defs" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_tool_defs_ws_key_uidx"
	ON "workspace_tool_defs" ("workspace_id", "key");
