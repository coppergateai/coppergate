-- GTM billing + paid pilot invite kind (D14)

ALTER TABLE "pilot_invites"
  ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'invite' NOT NULL;

CREATE TABLE IF NOT EXISTS "workspace_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan" text DEFAULT 'community' NOT NULL,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_price_id" text,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "workspace_subscriptions" ADD CONSTRAINT "workspace_subscriptions_workspace_id_fk"
	FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_subscriptions_workspace_uidx"
	ON "workspace_subscriptions" ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_subscriptions_customer_idx"
	ON "workspace_subscriptions" ("stripe_customer_id");
CREATE INDEX IF NOT EXISTS "workspace_subscriptions_status_idx"
	ON "workspace_subscriptions" ("status");
