ALTER TABLE "projects" DROP CONSTRAINT IF EXISTS "projects_current_brief_id_product_briefs_id_fk";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "current_brief_id";
DROP INDEX IF EXISTS "audit_events_workspace_created_idx";
DROP TABLE IF EXISTS "audit_events";
DROP INDEX IF EXISTS "product_briefs_workspace_id_idx";
DROP INDEX IF EXISTS "product_briefs_project_id_idx";
DROP TABLE IF EXISTS "product_briefs";
