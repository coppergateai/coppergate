import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "drizzle",
);

const client = postgres(url, {
  max: 1,
  connect_timeout: 30,
  idle_timeout: 20,
});
const db = drizzle(client);

try {
  await migrate(db, { migrationsFolder });
  console.log("Migrations applied.");
} finally {
  await client.end({ timeout: 5 });
}
