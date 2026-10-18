DROP INDEX IF EXISTS "projects_maintainer_enabled_idx";
DROP TABLE IF EXISTS "maintainer_events";

ALTER TABLE "agent_profiles"
  DROP COLUMN IF EXISTS "evolved_from_run_id",
  DROP COLUMN IF EXISTS "parent_profile_id",
  DROP COLUMN IF EXISTS "version";

ALTER TABLE "budgets"
  DROP COLUMN IF EXISTS "period_started_at",
  DROP COLUMN IF EXISTS "period";

ALTER TABLE "projects"
  DROP COLUMN IF EXISTS "last_vision_replan_at",
  DROP COLUMN IF EXISTS "last_maintainer_tick_at",
  DROP COLUMN IF EXISTS "maintainer_policy_json",
  DROP COLUMN IF EXISTS "maintainer_enabled";
