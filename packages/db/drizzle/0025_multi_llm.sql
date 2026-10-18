-- Multi-LLM BYOK connections + per-agent profile routing

ALTER TABLE "integration_credentials"
  ADD COLUMN IF NOT EXISTS "vendor" text,
  ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false NOT NULL;

-- Backfill vendor from legacy label-as-vendor practice
UPDATE "integration_credentials"
SET "vendor" = CASE
  WHEN lower(trim("label")) IN ('openai', 'groq', 'openrouter', 'ollama', 'lmstudio', 'custom')
    THEN lower(trim("label"))
  ELSE 'custom'
END
WHERE "vendor" IS NULL OR trim("vendor") = '';

ALTER TABLE "integration_credentials"
  ALTER COLUMN "vendor" SET DEFAULT 'custom',
  ALTER COLUMN "vendor" SET NOT NULL;

-- Normalize labels that were vendor ids into unique connection slugs
UPDATE "integration_credentials"
SET "label" = CASE
  WHEN lower(trim("label")) IN ('openai', 'groq', 'openrouter', 'ollama', 'lmstudio', 'custom') THEN
    lower(trim("label")) || '-default'
  WHEN trim("label") = '' OR "label" IS NULL THEN
    COALESCE(NULLIF(lower(trim("vendor")), ''), 'custom') || '-default'
  ELSE "label"
END
WHERE "provider" = 'llm_byok';

-- One default per workspace among active llm_byok rows
UPDATE "integration_credentials" AS ic
SET "is_default" = true
FROM (
  SELECT DISTINCT ON ("workspace_id") "id"
  FROM "integration_credentials"
  WHERE "provider" = 'llm_byok' AND "status" = 'active'
  ORDER BY "workspace_id", "created_at" ASC
) AS first_active
WHERE ic."id" = first_active."id";

DROP INDEX IF EXISTS "integration_credentials_ws_provider_uidx";

CREATE UNIQUE INDEX IF NOT EXISTS "integration_credentials_ws_provider_label_uidx"
  ON "integration_credentials" ("workspace_id", "provider", "label");

ALTER TABLE "agent_profiles"
  ADD COLUMN IF NOT EXISTS "llm_credential_id" uuid,
  ADD COLUMN IF NOT EXISTS "preferred_model" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_profiles_llm_credential_id_fk'
  ) THEN
    ALTER TABLE "agent_profiles"
      ADD CONSTRAINT "agent_profiles_llm_credential_id_fk"
      FOREIGN KEY ("llm_credential_id")
      REFERENCES "public"."integration_credentials"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "agent_profiles_llm_credential_id_idx"
  ON "agent_profiles" ("llm_credential_id");
