DROP INDEX IF EXISTS "workspaces_deleted_at_idx";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "deleted_at";
