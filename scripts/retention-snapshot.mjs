#!/usr/bin/env node
/**
 * TASK047 — export retention snapshot for operators.
 * Usage: DATABASE_URL=… node scripts/retention-snapshot.mjs
 */
import { createDb, getRetentionSnapshot, closeDb } from "@coppergate/db";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDb(url, { max: 1 });
try {
  const snap = await getRetentionSnapshot(db);
  console.log(JSON.stringify({ at: new Date().toISOString(), ...snap }, null, 2));
} finally {
  await closeDb(db);
}
