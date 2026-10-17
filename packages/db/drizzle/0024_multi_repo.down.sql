DROP INDEX IF EXISTS "repository_connections_project_primary_uidx";
DROP INDEX IF EXISTS "repository_connections_project_id_idx";

-- Restore one-repo-per-project only when no project has multiple bindings.
-- Fail closed: leave unique off if duplicates exist (operator must detach first).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "repository_connections"
    WHERE "project_id" IS NOT NULL
    GROUP BY "project_id"
    HAVING COUNT(*) > 1
  ) THEN
    ALTER TABLE "repository_connections"
      ADD CONSTRAINT "repository_connections_project_id_unique" UNIQUE ("project_id");
  END IF;
END $$;

ALTER TABLE "repository_connections" DROP COLUMN IF EXISTS "repo_role";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "multi_repo_policy";
