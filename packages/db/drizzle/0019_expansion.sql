-- Phase expansion — Dilim 0–4 (G1b default, BYOK, notify, issue, merge, share)

ALTER TABLE "arenas"
	ALTER COLUMN "min_human" SET DEFAULT true;

ALTER TABLE "workspaces"
	ADD COLUMN IF NOT EXISTS "notify_webhook_url" text,
	ADD COLUMN IF NOT EXISTS "notify_email_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "projects"
	ADD COLUMN IF NOT EXISTS "merge_enabled" boolean DEFAULT false NOT NULL;

ALTER TABLE "tasks"
	ADD COLUMN IF NOT EXISTS "github_issue_number" integer;

ALTER TABLE "agent_runs"
	ADD COLUMN IF NOT EXISTS "preview_url" text;

CREATE TABLE IF NOT EXISTS "integration_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text DEFAULT 'llm_byok' NOT NULL,
	"label" text DEFAULT 'default' NOT NULL,
	"encrypted_payload" text NOT NULL,
	"base_url" text,
	"model" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "integration_credentials" ADD CONSTRAINT "integration_credentials_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "integration_credentials_ws_provider_uidx"
	ON "integration_credentials" ("workspace_id", "provider");
CREATE INDEX IF NOT EXISTS "integration_credentials_workspace_id_idx"
	ON "integration_credentials" ("workspace_id");

CREATE TABLE IF NOT EXISTS "delivery_share_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"token" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "delivery_share_tokens" ADD CONSTRAINT "delivery_share_tokens_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_share_tokens" ADD CONSTRAINT "delivery_share_tokens_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_share_tokens" ADD CONSTRAINT "delivery_share_tokens_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "delivery_share_tokens" ADD CONSTRAINT "delivery_share_tokens_run_id_fk"
	FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_share_tokens_token_uidx"
	ON "delivery_share_tokens" ("token");
CREATE INDEX IF NOT EXISTS "delivery_share_tokens_run_id_idx"
	ON "delivery_share_tokens" ("run_id");
