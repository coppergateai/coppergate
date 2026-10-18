DROP INDEX IF EXISTS "agent_profiles_llm_credential_id_idx";

ALTER TABLE "agent_profiles"
  DROP CONSTRAINT IF EXISTS "agent_profiles_llm_credential_id_fk";

ALTER TABLE "agent_profiles"
  DROP COLUMN IF EXISTS "preferred_model",
  DROP COLUMN IF EXISTS "llm_credential_id";

DROP INDEX IF EXISTS "integration_credentials_ws_provider_label_uidx";

-- Restore single-credential uniqueness (keep only one active row per workspace if needed)
CREATE UNIQUE INDEX IF NOT EXISTS "integration_credentials_ws_provider_uidx"
  ON "integration_credentials" ("workspace_id", "provider");

ALTER TABLE "integration_credentials"
  DROP COLUMN IF EXISTS "is_default",
  DROP COLUMN IF EXISTS "vendor";
