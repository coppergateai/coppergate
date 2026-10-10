CREATE TABLE IF NOT EXISTS "github_webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"action" text,
	"github_installation_id" text,
	"payload" text NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "github_webhook_deliveries_delivery_id_unique" UNIQUE("delivery_id")
);

CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_event_idx"
	ON "github_webhook_deliveries" ("event");

CREATE INDEX IF NOT EXISTS "github_webhook_deliveries_received_at_idx"
	ON "github_webhook_deliveries" ("received_at");
