-- Agent temperament, skills catalog, MCP connections

ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "temperament" text DEFAULT 'balanced' NOT NULL,
  ADD COLUMN IF NOT EXISTS "skill_keys_json" text DEFAULT '[]' NOT NULL;

CREATE TABLE IF NOT EXISTS "agent_skills" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid,
  "key" text NOT NULL,
  "title" text NOT NULL,
  "body_markdown" text NOT NULL DEFAULT '',
  "version" integer NOT NULL DEFAULT 1,
  "parent_skill_id" uuid,
  "evolved_from_run_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "agent_skills_ws_key_uidx"
  ON "agent_skills" ("workspace_id", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "agent_skills_system_key_uidx"
  ON "agent_skills" ("key") WHERE "workspace_id" IS NULL;
CREATE INDEX IF NOT EXISTS "agent_skills_key_idx"
  ON "agent_skills" ("key");

CREATE TABLE IF NOT EXISTS "workspace_mcp_connections" (
  "id" uuid PRIMARY KEY NOT NULL,
  "workspace_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "display_name" text NOT NULL,
  "endpoint_url" text NOT NULL,
  "encrypted_payload" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "tool_allowlist_json" text NOT NULL DEFAULT '[]',
  "meta_json" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "workspace_mcp_connections" ADD CONSTRAINT "workspace_mcp_connections_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "workspace_mcp_connections_ws_idx"
  ON "workspace_mcp_connections" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_mcp_connections_ws_provider_uidx"
  ON "workspace_mcp_connections" ("workspace_id", "provider");
