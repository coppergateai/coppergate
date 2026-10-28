-- Skill snapshot on agent runs + support for generic MCP provider connections.

ALTER TABLE "agent_runs"
	ADD COLUMN IF NOT EXISTS "skill_snapshot_json" text DEFAULT '[]' NOT NULL;
