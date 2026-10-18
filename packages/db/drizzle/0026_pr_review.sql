-- Open PR review imports (brownfield wedge)

ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "github_pr_number" integer;

CREATE INDEX IF NOT EXISTS "tasks_project_github_pr_number_idx"
  ON "tasks" ("project_id", "github_pr_number")
  WHERE "github_pr_number" IS NOT NULL;
