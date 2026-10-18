-- Fully autonomous maintainer mode (MAINTAINER.md)

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "maintainer_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "maintainer_policy_json" text,
  ADD COLUMN IF NOT EXISTS "last_maintainer_tick_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_vision_replan_at" timestamp with time zone;

ALTER TABLE "budgets"
  ADD COLUMN IF NOT EXISTS "period" text DEFAULT 'lifetime' NOT NULL,
  ADD COLUMN IF NOT EXISTS "period_started_at" timestamp with time zone;

ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL,
  ADD COLUMN IF NOT EXISTS "parent_profile_id" uuid,
  ADD COLUMN IF NOT EXISTS "evolved_from_run_id" uuid;

CREATE TABLE IF NOT EXISTS "maintainer_events" (
  "id" uuid PRIMARY KEY,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "payload" text NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "maintainer_events_project_created_idx"
  ON "maintainer_events" ("project_id", "created_at");

CREATE INDEX IF NOT EXISTS "projects_maintainer_enabled_idx"
  ON "projects" ("maintainer_enabled")
  WHERE "maintainer_enabled" = true;
