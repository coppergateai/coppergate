DROP TABLE IF EXISTS "workspace_mcp_connections";
DROP TABLE IF EXISTS "agent_skills";
ALTER TABLE "agent_profiles" DROP COLUMN IF EXISTS "skill_keys_json";
ALTER TABLE "agent_profiles" DROP COLUMN IF EXISTS "temperament";
