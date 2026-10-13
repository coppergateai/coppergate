DROP TABLE IF EXISTS "delivery_share_tokens";
DROP TABLE IF EXISTS "integration_credentials";

ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "preview_url";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "github_issue_number";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "merge_enabled";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "notify_email_enabled";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "notify_webhook_url";

ALTER TABLE "arenas"
	ALTER COLUMN "min_human" SET DEFAULT false;
