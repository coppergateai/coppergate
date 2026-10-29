DROP INDEX IF EXISTS "usage_events_llm_tokens_run_role_uidx";
ALTER TABLE "usage_events" DROP COLUMN IF EXISTS "llm_provider_role";
