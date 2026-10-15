ALTER TABLE "github_webhook_deliveries" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "repository_connections" DROP COLUMN IF EXISTS "provider";
ALTER TABLE "github_installations" DROP COLUMN IF EXISTS "provider";

DROP INDEX IF EXISTS "users_auth_provider_external_uidx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "auth_provider";
ALTER TABLE "users" ADD CONSTRAINT "users_github_user_id_unique" UNIQUE ("github_user_id");
