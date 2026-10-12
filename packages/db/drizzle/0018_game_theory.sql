-- Phase M — Selection over Supervision (efficiency payoff + strategies)

ALTER TABLE "arenas"
	ADD COLUMN IF NOT EXISTS "payoff_alpha" double precision DEFAULT 0.5 NOT NULL;

ALTER TABLE "contenders"
	ADD COLUMN IF NOT EXISTS "strategy" text DEFAULT 'balanced' NOT NULL;

ALTER TABLE "agent_runs"
	ADD COLUMN IF NOT EXISTS "efficiency_score" double precision;
