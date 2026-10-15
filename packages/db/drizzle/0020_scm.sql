-- Multi-SCM (GitHub + GitLab) — D12

ALTER TABLE "users"
	ADD COLUMN IF NOT EXISTS "auth_provider" text DEFAULT 'github' NOT NULL;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_github_user_id_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "users_auth_provider_external_uidx"
	ON "users" ("auth_provider", "github_user_id");

ALTER TABLE "github_installations"
	ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'github' NOT NULL;

ALTER TABLE "repository_connections"
	ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'github' NOT NULL;

ALTER TABLE "github_webhook_deliveries"
	ADD COLUMN IF NOT EXISTS "provider" text DEFAULT 'github' NOT NULL;
