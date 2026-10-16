#!/usr/bin/env node
/**
 * Export waitlist signups for pilot outreach (GTM Phase 0).
 * Usage: DATABASE_URL=… pnpm exec tsx scripts/list-waitlist.mjs
 */
import { createDb, closeDb, waitlistSignups } from "../packages/db/src/index.ts";
import { desc } from "drizzle-orm";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });
try {
  const rows = await db
    .select()
    .from(waitlistSignups)
    .orderBy(desc(waitlistSignups.createdAt));
  console.log(JSON.stringify({ count: rows.length, signups: rows }, null, 2));
} finally {
  await closeDb(db);
}
