-- Align arenas.payoff_alpha default with DEFAULT_PAYOFF_ALPHA (0.25).
-- Existing rows that still use the legacy 0.5 default are normalized.

ALTER TABLE "arenas"
	ALTER COLUMN "payoff_alpha" SET DEFAULT 0.25;

UPDATE "arenas"
	SET "payoff_alpha" = 0.25
	WHERE "payoff_alpha" = 0.5;
