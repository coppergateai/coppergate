-- TASK121 — multi-repo project: primary + secondary repos under one arena

ALTER TABLE "projects"
  ADD COLUMN IF NOT EXISTS "multi_repo_policy" text;

ALTER TABLE "repository_connections"
  ADD COLUMN IF NOT EXISTS "repo_role" text DEFAULT 'primary' NOT NULL;

-- Existing bindings are primary for their project.
UPDATE "repository_connections"
  SET "repo_role" = 'primary'
  WHERE "project_id" IS NOT NULL;

ALTER TABLE "repository_connections"
  DROP CONSTRAINT IF EXISTS "repository_connections_project_id_unique";

CREATE INDEX IF NOT EXISTS "repository_connections_project_id_idx"
  ON "repository_connections" ("project_id");

CREATE UNIQUE INDEX IF NOT EXISTS "repository_connections_project_primary_uidx"
  ON "repository_connections" ("project_id")
  WHERE "project_id" IS NOT NULL AND "repo_role" = 'primary';
