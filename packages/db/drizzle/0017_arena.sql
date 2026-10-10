-- TASK048 — Survivor arena domain (ARENA.md)

CREATE TABLE IF NOT EXISTS "arenas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"min_human" boolean DEFAULT false NOT NULL,
	"prod_writes_enabled" boolean DEFAULT false NOT NULL,
	"default_contender_n" integer DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'ARMED' NOT NULL,
	"killed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "arenas" ADD CONSTRAINT "arenas_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "arenas" ADD CONSTRAINT "arenas_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "arenas_project_id_uidx" ON "arenas" ("project_id");
CREATE INDEX IF NOT EXISTS "arenas_workspace_id_idx" ON "arenas" ("workspace_id");

CREATE TABLE IF NOT EXISTS "contenders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"arena_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"profile_key" text DEFAULT 'engineer' NOT NULL,
	"budget_micros_remaining" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"eliminated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "contenders" ADD CONSTRAINT "contenders_arena_id_fk"
	FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "contenders" ADD CONSTRAINT "contenders_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "contenders_arena_id_idx" ON "contenders" ("arena_id");
CREATE INDEX IF NOT EXISTS "contenders_workspace_id_idx" ON "contenders" ("workspace_id");

CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"arena_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"n" integer DEFAULT 2 NOT NULL,
	"winner_run_id" uuid,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_project_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_arena_id_fk"
	FOREIGN KEY ("arena_id") REFERENCES "public"."arenas"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_task_id_fk"
	FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "tournaments_task_id_idx" ON "tournaments" ("task_id");
CREATE INDEX IF NOT EXISTS "tournaments_arena_id_idx" ON "tournaments" ("arena_id");
CREATE INDEX IF NOT EXISTS "tournaments_workspace_id_idx" ON "tournaments" ("workspace_id");

ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "tournament_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "contender_id" uuid;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "fitness_score" double precision;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "fitness_evidence_ref" text;
ALTER TABLE "agent_runs" ADD COLUMN IF NOT EXISTS "tournament_result" text;

ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_tournament_id_fk"
	FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_contender_id_fk"
	FOREIGN KEY ("contender_id") REFERENCES "public"."contenders"("id") ON DELETE set null ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "agent_runs_tournament_id_idx" ON "agent_runs" ("tournament_id");
CREATE INDEX IF NOT EXISTS "agent_runs_contender_id_idx" ON "agent_runs" ("contender_id");

ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_winner_run_id_fk"
	FOREIGN KEY ("winner_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
