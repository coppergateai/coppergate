CREATE TABLE IF NOT EXISTS "schema_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "schema_meta" ("key", "value")
VALUES ('baseline', 'TASK001')
ON CONFLICT ("key") DO UPDATE SET
  "value" = EXCLUDED."value",
  "updated_at" = now();
