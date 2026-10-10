import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Baseline schema for TASK001 — proves migrations work.
 * Domain tables (users, workspaces, …) land in later tasks.
 */
export const schemaMeta = pgTable("schema_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
