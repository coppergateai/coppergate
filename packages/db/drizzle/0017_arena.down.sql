ALTER TABLE "tournaments" DROP CONSTRAINT IF EXISTS "tournaments_winner_run_id_fk";

ALTER TABLE "agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_contender_id_fk";
ALTER TABLE "agent_runs" DROP CONSTRAINT IF EXISTS "agent_runs_tournament_id_fk";
DROP INDEX IF EXISTS "agent_runs_contender_id_idx";
DROP INDEX IF EXISTS "agent_runs_tournament_id_idx";
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "tournament_result";
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "fitness_evidence_ref";
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "fitness_score";
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "contender_id";
ALTER TABLE "agent_runs" DROP COLUMN IF EXISTS "tournament_id";

DROP TABLE IF EXISTS "tournaments";
DROP TABLE IF EXISTS "contenders";
DROP TABLE IF EXISTS "arenas";
