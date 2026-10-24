-- Single-use consume ledger for signed OAuth / install state (jti).
CREATE TABLE IF NOT EXISTS "consumed_signed_states" (
	"jti" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"workspace_id" uuid,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "consumed_signed_states_expires_at_idx"
	ON "consumed_signed_states" ("expires_at");

CREATE INDEX IF NOT EXISTS "consumed_signed_states_kind_idx"
	ON "consumed_signed_states" ("kind");
