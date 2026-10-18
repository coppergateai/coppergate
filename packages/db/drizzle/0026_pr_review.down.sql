DROP INDEX IF EXISTS "tasks_project_github_pr_number_idx";

ALTER TABLE "tasks"
  DROP COLUMN IF EXISTS "github_pr_number";
