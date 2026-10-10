ALTER TABLE "repository_connections"
	DROP CONSTRAINT IF EXISTS "repository_connections_project_id_projects_id_fk";
DROP INDEX IF EXISTS "projects_workspace_id_idx";
DROP TABLE IF EXISTS "projects";
