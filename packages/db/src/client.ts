import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string, options?: { max?: number }) {
  const client = postgres(url, {
    max: options?.max ?? 10,
    // Fail fast on unreachable hosts (e.g. Fly Postgres OOM) instead of
    // holding Vercel serverless invocations until the platform kills them.
    connect_timeout: 10,
    // Allow Node test processes to exit when idle (web singleton pool).
    idle_timeout: 5,
    max_lifetime: 60 * 30,
  });
  const db = drizzle(client, { schema });
  return Object.assign(db, { $client: client as Sql });
}

export async function closeDb(db: Database): Promise<void> {
  await db.$client.end({ timeout: 5 });
}

export async function checkDb(url: string): Promise<boolean> {
  const client = postgres(url, { max: 1 });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 5 });
  }
}

export { schema };
