CREATE TABLE IF NOT EXISTS "pilot_invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"note" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"redeemed_by_user_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pilot_invites_code_unique" UNIQUE("code")
);

CREATE INDEX IF NOT EXISTS "pilot_invites_code_idx" ON "pilot_invites" ("code");
