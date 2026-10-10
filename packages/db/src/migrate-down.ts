import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Rolls back the TASK001 baseline migration and clears drizzle journal.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const downSql = readFileSync(path.join(dir, "0000_baseline.down.sql"), "utf8");

const client = postgres(url, { max: 1 });
try {
  await client.unsafe(downSql);
  await client`drop table if exists drizzle.__drizzle_migrations cascade`;
  await client`drop table if exists "__drizzle_migrations" cascade`;
  await client`drop schema if exists drizzle cascade`;
  console.log("Baseline migration rolled back.");
} finally {
  await client.end({ timeout: 5 });
}
