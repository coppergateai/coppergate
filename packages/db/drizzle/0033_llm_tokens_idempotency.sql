-- F2: llm_tokens spend idempotency — unique (run_id, llm_provider_role) so
-- concurrent appendUsageEvent cannot double-debit the same primary/fallback/legacy slice.

ALTER TABLE "usage_events"
	ADD COLUMN IF NOT EXISTS "llm_provider_role" text;

-- Backfill role from meta JSON (AG-016 providerRole) or legacy.
UPDATE "usage_events"
SET "llm_provider_role" = CASE
	WHEN "kind" <> 'llm_tokens' OR "run_id" IS NULL THEN NULL
	WHEN "meta" IS NULL OR btrim("meta") = '' THEN 'legacy'
	WHEN "meta"::json->>'providerRole' = 'fallback' THEN 'fallback'
	WHEN "meta"::json->>'providerRole' = 'primary' THEN 'primary'
	ELSE 'legacy'
END
WHERE "kind" = 'llm_tokens' AND "run_id" IS NOT NULL AND "llm_provider_role" IS NULL;

-- Keep earliest debit per (run_id, role); drop duplicate races.
DELETE FROM "usage_events" AS u
USING "usage_events" AS d
WHERE u."kind" = 'llm_tokens'
	AND d."kind" = 'llm_tokens'
	AND u."run_id" IS NOT NULL
	AND u."run_id" = d."run_id"
	AND u."llm_provider_role" IS NOT NULL
	AND u."llm_provider_role" = d."llm_provider_role"
	AND (
		u."created_at" > d."created_at"
		OR (u."created_at" = d."created_at" AND u."id"::text > d."id"::text)
	);

CREATE UNIQUE INDEX IF NOT EXISTS "usage_events_llm_tokens_run_role_uidx"
	ON "usage_events" ("run_id", "llm_provider_role")
	WHERE "kind" = 'llm_tokens'
		AND "run_id" IS NOT NULL
		AND "llm_provider_role" IS NOT NULL;
