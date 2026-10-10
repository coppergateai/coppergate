import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Rolls back migrations newest-first
 * (waitlist → github → workspaces → users → baseline).
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");
const downs = [
  "0004_waitlist.down.sql",
  "0003_github.down.sql",
  "0002_workspaces.down.sql",
  "0001_users.down.sql",
  "0000_baseline.down.sql",
];

const client = postgres(url, { max: 1 });
try {
  for (const file of downs) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    await client.unsafe(sql);
    console.log(`Applied ${file}`);
  }
  await client`drop table if exists drizzle.__drizzle_migrations cascade`;
  await client`drop table if exists "__drizzle_migrations" cascade`;
  await client`drop schema if exists drizzle cascade`;
  console.log("All migrations rolled back.");
} finally {
  await client.end({ timeout: 5 });
}
