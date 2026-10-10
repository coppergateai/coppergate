CREATE TABLE IF NOT EXISTS "github_installations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"github_installation_id" text NOT NULL,
	"account_login" text NOT NULL,
	"account_type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"encrypted_token" text,
	"token_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_installations_github_installation_id_unique" UNIQUE("github_installation_id"),
	CONSTRAINT "github_installations_workspace_id_unique" UNIQUE("workspace_id")
);

ALTER TABLE "github_installations" ADD CONSTRAINT "github_installations_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE TABLE IF NOT EXISTS "repository_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"github_repo_id" text NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text NOT NULL,
	"base_repo_full_name" text NOT NULL,
	"installation_status" text DEFAULT 'active' NOT NULL,
	"compatibility" text,
	"project_id" uuid,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repository_connections_project_id_unique" UNIQUE("project_id")
);

ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_workspace_id_workspaces_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "repository_connections" ADD CONSTRAINT "repo_conn_installation_fk"
	FOREIGN KEY ("installation_id") REFERENCES "public"."github_installations"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "repository_connections_workspace_repo_uidx"
	ON "repository_connections" ("workspace_id","github_repo_id");

CREATE INDEX IF NOT EXISTS "repository_connections_workspace_id_idx"
	ON "repository_connections" ("workspace_id");
