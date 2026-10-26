DROP INDEX IF EXISTS "agent_profiles_llm_credential_id_idx";

ALTER TABLE "agent_profiles"
  DROP CONSTRAINT IF EXISTS "agent_profiles_llm_credential_id_fk";

ALTER TABLE "agent_profiles"
  DROP COLUMN IF EXISTS "preferred_model",
  DROP COLUMN IF EXISTS "llm_credential_id";

DROP INDEX IF EXISTS "integration_credentials_ws_provider_label_uidx";

-- Collapse multi-BYOK rows so (workspace_id, provider) can be unique again.
-- Keep the default active row when present, else the oldest row.
DELETE FROM "integration_credentials" AS ic
WHERE ic."id" IN (
  SELECT d."id"
  FROM "integration_credentials" AS d
  WHERE d."id" NOT IN (
    SELECT DISTINCT ON ("workspace_id", "provider") "id"
    FROM "integration_credentials"
    ORDER BY
      "workspace_id",
      "provider",
      ("is_default" AND "status" = 'active') DESC,
      "created_at" ASC
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "integration_credentials_ws_provider_uidx"
  ON "integration_credentials" ("workspace_id", "provider");

ALTER TABLE "integration_credentials"
  DROP COLUMN IF EXISTS "is_default",
  DROP COLUMN IF EXISTS "vendor";
